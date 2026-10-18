package dev.salman.backend.lib;

import java.util.UUID;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import dev.salman.backend.service.PresenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Turns socket lifecycle events into presence: a socket that opened is online, one that closed is not. */
@Slf4j
@Component
@RequiredArgsConstructor
public class PresenceListener {

	private final PresenceService presence;

	@EventListener
	public void onConnected(SessionConnectedEvent event) {
		var user = event.getUser();
		if (user != null) {
			guarded(() -> presence.connected(UUID.fromString(user.getName()),
					StompHeaderAccessor.wrap(event.getMessage()).getSessionId()));
		}
	}

	@EventListener
	public void onDisconnect(SessionDisconnectEvent event) {
		var user = event.getUser();
		if (user != null) {
			guarded(() -> presence.disconnected(UUID.fromString(user.getName()), event.getSessionId()));
		}
	}

	/** Presence must never break a connection, so a failure here is only logged. */
	private void guarded(Runnable action) {
		try {
			action.run();
		}
		catch (RuntimeException e) {
			log.warn("Could not update presence", e);
		}
	}

}
