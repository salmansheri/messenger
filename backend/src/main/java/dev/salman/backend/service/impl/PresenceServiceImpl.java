package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.SessionCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.PresenceView;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.PresenceService;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Per User, a sorted set of their socket ids scored by when each entry lapses, plus an "announced" flag saying the
 * User was already announced online. Every read-modify-write is a Lua script so several instances stay consistent.
 * Times come from the {@link Clock} bean (only the grace-period timer uses real time).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PresenceServiceImpl implements PresenceService {

	/** KEYS: sockets, announced. ARGV: socket id, now ms, entry ttl ms, key ttl ms. Returns 1 when newly announced. */
	private static final RedisScript<Long> CONNECT = new DefaultRedisScript<>("""
			local now = tonumber(ARGV[2])
			redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
			redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[1])
			redis.call('PEXPIRE', KEYS[1], ARGV[4])
			if redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[4]) then return 1 end
			redis.call('PEXPIRE', KEYS[2], ARGV[4])
			return 0
			""", Long.class);

	/** KEYS: sockets. ARGV: socket id, now ms. Returns how many live sockets remain. */
	private static final RedisScript<Long> DISCONNECT = new DefaultRedisScript<>("""
			redis.call('ZREM', KEYS[1], ARGV[1])
			redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[2]))
			return redis.call('ZCARD', KEYS[1])
			""", Long.class);

	/** KEYS: sockets, announced. ARGV: now ms. Returns -1 if a socket is live again, else 1 if the flag was cleared. */
	private static final RedisScript<Long> CONFIRM_OFFLINE = new DefaultRedisScript<>("""
			redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]))
			if redis.call('ZCARD', KEYS[1]) > 0 then return -1 end
			return redis.call('DEL', KEYS[2])
			""", Long.class);

	private static final int KEY_LIFETIME_FACTOR = 4;

	private final StringRedisTemplate redis;
	private final ParticipantRepository participants;
	private final UserRepository users;
	private final RealtimeEvents events;
	private final TaskScheduler taskScheduler; // named after the bean: Spring also defines one for the message broker
	private final AppProperties props;
	private final Clock clock;

	@Override
	public void connected(UUID userId, String sessionId) {
		var ttl = props.presence().ttl().toMillis();
		var announced = redis.execute(CONNECT, List.of(socketsKey(userId), announcedKey(userId)), sessionId,
				String.valueOf(clock.millis()), String.valueOf(ttl), String.valueOf(ttl * KEY_LIFETIME_FACTOR));
		if (Long.valueOf(1).equals(announced)) {
			events.presenceChanged(userId, true, null);
		}
	}

	@Override
	public void refresh(UUID userId, String sessionId) {
		connected(userId, sessionId);
	}

	@Override
	public void disconnected(UUID userId, String sessionId) {
		var disconnectedAt = clock.instant();
		var remaining = redis.execute(DISCONNECT, List.of(socketsKey(userId)), sessionId,
				String.valueOf(clock.millis()));
		if (remaining != null && remaining == 0) {
			taskScheduler.schedule(() -> confirmOffline(userId, disconnectedAt),
					Instant.now().plus(props.presence().offlineGrace()));
		}
	}

	/** After the grace period: still no socket means the User is really gone. */
	private void confirmOffline(UUID userId, Instant disconnectedAt) {
		try {
			var result = redis.execute(CONFIRM_OFFLINE, List.of(socketsKey(userId), announcedKey(userId)),
					String.valueOf(clock.millis()));
			if (result == null || result < 0) {
				return; // they came back in time
			}
			users.updateLastSeen(userId, disconnectedAt);
			if (result == 1) {
				events.presenceChanged(userId, false, disconnectedAt);
			}
		}
		catch (RuntimeException e) {
			log.warn("Could not mark a user offline", e);
		}
	}

	@Override
	@Transactional(readOnly = true)
	public List<PresenceView> presenceOf(UUID callerId, UUID conversationId) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw new NotFoundException("Conversation not found.");
		}
		var others = participants.findByConversationId(conversationId).stream().map(Participant::getUserId)
				.filter(id -> !id.equals(callerId)).toList();
		var online = liveSocketCounts(others);
		var lastSeen = users.findAllById(others).stream().filter(u -> u.getLastSeenAt() != null)
				.collect(java.util.stream.Collectors.toMap(User::getId, User::getLastSeenAt));
		var views = new ArrayList<PresenceView>();
		for (int i = 0; i < others.size(); i++) {
			var isOnline = online.get(i) > 0;
			views.add(new PresenceView(others.get(i), isOnline, isOnline ? null : lastSeen.get(others.get(i))));
		}
		return views;
	}

	/** How many live sockets each User has, in one round trip. */
	private List<Long> liveSocketCounts(List<UUID> userIds) {
		var liveAfter = clock.millis() + 1; // an entry is live while its lapse time is still ahead of now
		var results = redis.executePipelined(new SessionCallback<Object>() {
			@Override
			@SuppressWarnings("unchecked")
			public <K, V> Object execute(RedisOperations<K, V> operations) throws DataAccessException {
				var ops = (RedisOperations<String, String>) operations;
				userIds.forEach(id -> ops.opsForZSet().count(socketsKey(id), liveAfter, Double.POSITIVE_INFINITY));
				return null;
			}
		});
		return results.stream().map(r -> r instanceof Number n ? n.longValue() : 0L).toList();
	}

	private static String socketsKey(UUID userId) {
		return "presence:sockets:" + userId;
	}

	private static String announcedKey(UUID userId) {
		return "presence:announced:" + userId;
	}

}
