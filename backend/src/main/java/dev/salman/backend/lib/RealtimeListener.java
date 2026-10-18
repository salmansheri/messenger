package dev.salman.backend.lib;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import dev.salman.backend.dto.RealtimeEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/**
 * Receives every instance's events from RabbitMQ and acts on those that concern sockets open on THIS instance:
 * normal events are pushed to each recipient who has a socket here, and the control event {@link #AUTH_REVOKED}
 * closes all of a recipient's sockets here. Recipients with no socket here are skipped; the instance they are
 * connected to handles them. One recipient failing never stops the others.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RealtimeListener {

	/** The only destination clients listen on for events; each User has their own copy. */
	public static final String USER_EVENTS = "/queue/events";

	/** Control event, never forwarded to clients: the recipient's credentials were revoked, drop their sockets. */
	public static final String AUTH_REVOKED = "auth.revoked";

	private final SimpMessagingTemplate messaging;
	private final StompSessions sessions;
	private final JsonMapper json;

	@RabbitListener(queues = "#{realtimeQueue.name}")
	public void onEvent(String body) {
		RealtimeEvent event;
		try {
			event = json.readValue(body, RealtimeEvent.class);
		}
		catch (RuntimeException e) {
			log.warn("Dropped a malformed realtime event", e);
			return;
		}
		var revoked = AUTH_REVOKED.equals(event.payload().get("type"));
		for (var recipient : event.recipients()) {
			try {
				if (revoked) {
					sessions.closeAllFor(recipient.toString());
				}
				else {
					messaging.convertAndSendToUser(recipient.toString(), USER_EVENTS, event.payload());
				}
			}
			catch (RuntimeException e) {
				log.warn("Could not deliver a realtime event to one recipient", e);
			}
		}
	}

}
