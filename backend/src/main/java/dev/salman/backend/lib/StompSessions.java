package dev.salman.backend.lib;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
 * Tracks open sockets and when each one's access token runs out. A socket may live no longer than its token: frames
 * after that moment are refused and {@link #closeExpired()} closes idle sockets, so a long-lived connection is no
 * more of a revocation gap than a REST call with the same token.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompSessions {

	private static final Duration CLOSE_DELAY = Duration.ofMillis(200);

	private final Clock clock;
	private final ConcurrentMap<String, WebSocketSession> sockets = new ConcurrentHashMap<>();
	private final ConcurrentMap<String, Instant> expiries = new ConcurrentHashMap<>();

	/** Registers the decorator that remembers each socket from the moment it opens until it closes. */
	public void register(WebSocketTransportRegistration registry) {
		registry.addDecoratorFactory(handler -> new WebSocketHandlerDecorator(handler) {
			@Override
			public void afterConnectionEstablished(WebSocketSession session) throws Exception {
				sockets.put(session.getId(), session);
				super.afterConnectionEstablished(session);
			}

			@Override
			public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
				sockets.remove(session.getId());
				expiries.remove(session.getId());
				super.afterConnectionClosed(session, closeStatus);
			}
		});
	}

	public void authenticated(String sessionId, Instant tokenExpiresAt) {
		expiries.put(sessionId, tokenExpiresAt);
	}

	/** True while the socket's access token has not run out. */
	public boolean isLive(String sessionId) {
		var expiresAt = expiries.get(sessionId);
		return expiresAt != null && clock.instant().isBefore(expiresAt);
	}

	/** Closes the socket a moment from now, so the ERROR frame explaining why can still be delivered first. */
	public void closeSoon(String sessionId) {
		CompletableFuture.runAsync(() -> close(sessionId), CompletableFuture.delayedExecutor(
				CLOSE_DELAY.toMillis(), TimeUnit.MILLISECONDS));
	}

	@Scheduled(fixedDelayString = "PT30S")
	public void closeExpired() {
		expiries.keySet().stream().filter(id -> !isLive(id)).forEach(this::close);
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
