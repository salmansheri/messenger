package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.SessionCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
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
 * User was already announced online. A shared sorted set {@code presence:watch} holds every User who may need to be
 * declared offline, scored by when they are expected to have no socket left (a clean disconnect scores the disconnect
 * time, otherwise the latest lapse time). Offline is never decided by a timer in one instance's memory: every
 * instance sweeps the watch set, so a restart or crash only delays the announcement. A sweep claims a User with a
 * short lease and releases it once the announcement went out, so a failed publish is retried. Every read-modify-write
 * is a Lua script so several instances stay consistent. All times come from the {@link Clock} bean.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PresenceServiceImpl implements PresenceService {

	private static final String WATCH = "presence:watch";
	private static final String CLAIMED = "presence:claimed";
	private static final int SWEEP_BATCH = 100;
	private static final int KEY_LIFETIME_FACTOR = 4;

	/**
	 * KEYS: sockets, announced, watch, claimed. ARGV: now ms, entry ttl ms, key ttl ms, user id, socket ids... Returns 1
	 * when the User was newly announced.
	 */
	private static final RedisScript<Long> CONNECT = new DefaultRedisScript<>("""
			local now = tonumber(ARGV[1])
			local lapse = now + tonumber(ARGV[2])
			redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
			for i = 5, #ARGV do redis.call('ZADD', KEYS[1], lapse, ARGV[i]) end
			redis.call('PEXPIRE', KEYS[1], ARGV[3])
			redis.call('ZADD', KEYS[3], 'GT', lapse, ARGV[4])
			redis.call('ZREM', KEYS[4], ARGV[4])
			if redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[3]) then return 1 end
			redis.call('PEXPIRE', KEYS[2], ARGV[3])
			return 0
			""", Long.class);

	/** KEYS: sockets, watch, claimed. ARGV: socket id, now ms, user id. Returns how many live sockets remain. */
	private static final RedisScript<Long> DISCONNECT = new DefaultRedisScript<>("""
			redis.call('ZREM', KEYS[1], ARGV[1])
			redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[2]))
			local left = redis.call('ZCARD', KEYS[1])
			if left == 0 then
				redis.call('ZADD', KEYS[2], tonumber(ARGV[2]), ARGV[3])
				redis.call('ZREM', KEYS[3], ARGV[3])
			end
			return left
			""", Long.class);

	/**
	 * KEYS: watch, sockets, announced, claimed. ARGV: user id, now ms, lease ms. Returns -1 when the User has a live socket
	 * (or is not watched), else the time they went quiet in ms, and holds the User for the lease.
	 */
	private static final RedisScript<Long> CLAIM = new DefaultRedisScript<>("""
			local now = tonumber(ARGV[2])
			redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
			if redis.call('ZCARD', KEYS[2]) > 0 then
				local top = redis.call('ZRANGE', KEYS[2], -1, -1, 'WITHSCORES')
				redis.call('ZADD', KEYS[1], top[2], ARGV[1])
				redis.call('ZREM', KEYS[4], ARGV[1])
				return -1
			end
			local at = redis.call('ZSCORE', KEYS[4], ARGV[1])
			if not at then
				at = redis.call('ZSCORE', KEYS[1], ARGV[1])
				if not at then return -1 end
				redis.call('ZADD', KEYS[4], at, ARGV[1])
			end
			redis.call('DEL', KEYS[3])
			redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[1])
			return tonumber(at)
			""", Long.class);

	/** KEYS: watch, claimed. ARGV: user id, lease score. Drops the User unless they came back since the claim. */
	private static final RedisScript<Long> RELEASE = new DefaultRedisScript<>("""
			local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
			if score and tonumber(score) == tonumber(ARGV[2]) then
				redis.call('ZREM', KEYS[1], ARGV[1])
				redis.call('ZREM', KEYS[2], ARGV[1])
				return 1
			end
			return 0
			""", Long.class);

	private final StringRedisTemplate redis;
	private final ParticipantRepository participants;
	private final UserRepository users;
	private final RealtimeEvents events;
	private final AppProperties props;
	private final Clock clock;

	@Override
	public void connected(UUID userId, String sessionId) {
		refresh(userId, List.of(sessionId));
	}

	@Override
	public void refresh(UUID userId, Collection<String> sessionIds) {
		var ttl = props.presence().ttl().toMillis();
		var args = new ArrayList<String>(List.of(String.valueOf(clock.millis()), String.valueOf(ttl),
				String.valueOf(ttl * KEY_LIFETIME_FACTOR), userId.toString()));
		args.addAll(sessionIds);
		var announced = redis.execute(CONNECT,
				List.of(socketsKey(userId), announcedKey(userId), WATCH, CLAIMED), args.toArray());
		if (Long.valueOf(1).equals(announced)) {
			try {
				events.presenceChanged(userId, true, null);
			}
			catch (RuntimeException e) {
				redis.delete(announcedKey(userId)); // not told yet: the next heartbeat announces it again
				throw e;
			}
		}
	}

	@Override
	public void disconnected(UUID userId, String sessionId) {
		var now = clock.millis();
		var remaining = redis.execute(DISCONNECT, List.of(socketsKey(userId), WATCH, CLAIMED), sessionId,
				String.valueOf(now), userId.toString());
		if (remaining != null && remaining == 0) {
			users.updateLastSeen(userId, Instant.ofEpochMilli(now));
		}
	}

	@Override
	public void sweep() {
		var now = clock.millis();
		var quietSince = now - props.presence().offlineGrace().toMillis();
		var due = redis.opsForZSet().rangeByScore(WATCH, Double.NEGATIVE_INFINITY, quietSince, 0, SWEEP_BATCH);
		if (due == null) {
			return;
		}
		due.forEach(user -> {
			try {
				declareOffline(UUID.fromString(user), now);
			}
			catch (RuntimeException e) {
				log.warn("Could not mark a user offline; the next sweep retries", e);
			}
		});
	}

	/** Claims the User, records when they were last seen and announces it; the claim lapses by itself if that fails. */
	private void declareOffline(UUID userId, long now) {
		var lease = props.presence().ttl().toMillis();
		var wentQuiet = redis.execute(CLAIM, List.of(WATCH, socketsKey(userId), announcedKey(userId), CLAIMED),
				userId.toString(), String.valueOf(now), String.valueOf(lease));
		if (wentQuiet == null || wentQuiet < 0) {
			return; // they have a live socket
		}
		var lastSeen = Instant.ofEpochMilli(wentQuiet);
		users.updateLastSeen(userId, lastSeen);
		events.presenceChanged(userId, false, lastSeen);
		redis.execute(RELEASE, List.of(WATCH, CLAIMED), userId.toString(), String.valueOf(now + lease));
	}

	@Override
	public Set<UUID> onlineAmong(Collection<UUID> userIds) {
		var ids = List.copyOf(new HashSet<>(userIds));
		var counts = liveSocketCounts(ids);
		var online = new HashSet<UUID>();
		for (int i = 0; i < ids.size(); i++) {
			if (counts.get(i) > 0) {
				online.add(ids.get(i));
			}
		}
		return online;
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
				.collect(Collectors.toMap(User::getId, User::getLastSeenAt));
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
