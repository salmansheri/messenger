package dev.salman.backend.lib;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Tracks open sockets: which User each belongs to once authenticated, and when its access token runs out. A socket may
 * live no longer than its token: frames after that are refused and {@link #closeExpired()} closes sockets that have
 * gone quiet, so a long-lived connection is no more of a revocation gap than a REST call with the same token.
 * {@link #closeAllFor} drops every socket of a User at once (password reset). Sockets that never authenticate need no
 * sweep here: the transport drops one that sends nothing (time to first message), and a bare heartbeat or any frame
 * before CONNECT makes the protocol layer close it.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompSessions {

	private static final Duration CLOSE_DELAY = Duration.ofMillis(200);

	private record Authenticated(String userId, Instant expiresAt) {
	}

	private final Clock clock;
	private final ConcurrentMap<String, WebSocketSession> sockets = new ConcurrentHashMap<>();
	private final ConcurrentMap<String, Authenticated> authenticated = new ConcurrentHashMap<>();

	/** Registers the decorator that remembers each socket from the moment it opens until it closes. */
	public void register(WebSocketTransportRegistration registry) {
		registry.addDecoratorFactory(this::remembering);
	}

	private WebSocketHandler remembering(WebSocketHandler handler) {
		return new WebSocketHandlerDecorator(handler) {
			@Override
			public void afterConnectionEstablished(WebSocketSession session) throws Exception {
				sockets.put(session.getId(), session);
				super.afterConnectionEstablished(session);
			}

			@Override
			public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
				sockets.remove(session.getId());
				authenticated.remove(session.getId());
				super.afterConnectionClosed(session, closeStatus);
			}
		};
	}

	/** Records who the socket belongs to and how long its token is good for. */
	public void authenticated(String sessionId, String userId, Instant tokenExpiresAt) {
		authenticated.put(sessionId, new Authenticated(userId, tokenExpiresAt));
	}

	public boolean isAuthenticated(String sessionId) {
		return authenticated.containsKey(sessionId);
	}

	/** True while the socket has authenticated and its access token has not run out. */
	public boolean isLive(String sessionId) {
		var session = authenticated.get(sessionId);
		return session != null && clock.instant().isBefore(session.expiresAt());
	}

	/** Every authenticated socket on this instance whose access token is still good, as socket id to User id. */
	public Map<String, UUID> liveSessions() {
		var live = new HashMap<String, UUID>();
		authenticated.forEach((sessionId, session) -> {
			if (clock.instant().isBefore(session.expiresAt())) {
				live.put(sessionId, UUID.fromString(session.userId()));
			}
		});
		return live;
	}

	/** Closes the socket a moment from now, so the ERROR frame explaining why can still be delivered first. */
	public void closeSoon(String sessionId) {
		CompletableFuture.runAsync(() -> close(sessionId), CompletableFuture.delayedExecutor(
				CLOSE_DELAY.toMillis(), TimeUnit.MILLISECONDS));
	}

	/** Closes every socket this instance holds for the User. Other instances do the same on the same event. */
	public void closeAllFor(String userId) {
		authenticated.forEach((sessionId, session) -> {
			if (session.userId().equals(userId)) {
				close(sessionId);
			}
		});
	}

	@Scheduled(fixedDelayString = "PT10S")
	public void closeExpired() {
		authenticated.keySet().stream().filter(id -> !isLive(id)).forEach(this::close);
	}

	private void close(String sessionId) {
		var socket = sockets.get(sessionId);
		if (socket != null && socket.isOpen()) {
			try {
				socket.close(CloseStatus.POLICY_VIOLATION);
			}
			catch (Exception e) {
				log.debug("Could not close socket {}", sessionId, e);
			}
		}
	}

}
