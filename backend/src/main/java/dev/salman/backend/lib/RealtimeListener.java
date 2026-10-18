package dev.salman.backend.lib;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import dev.salman.backend.dto.RealtimeEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/**
 * Receives every instance's events from RabbitMQ and pushes each one to the recipients who have a socket open on
 * THIS instance. Recipients with no socket here are simply skipped; the instance they are connected to handles them.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RealtimeListener {

	/** The only destination clients listen on for events; each User has their own copy. */
	public static final String USER_EVENTS = "/queue/events";

	private final SimpMessagingTemplate messaging;
	private final JsonMapper json;

	@RabbitListener(queues = "#{realtimeQueue.name}")
	public void onEvent(String body) {
		try {
			var event = json.readValue(body, RealtimeEvent.class);
			for (var recipient : event.recipients()) {
				messaging.convertAndSendToUser(recipient.toString(), USER_EVENTS, event.payload());
			}
		}
		catch (RuntimeException e) {
			log.warn("Dropped a malformed realtime event", e);
		}
	}

}
