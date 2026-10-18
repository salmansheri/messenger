package dev.salman.backend.lib;

import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import dev.salman.backend.dto.RealtimeEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/** Publishes to a fanout exchange, so every instance gets a copy. A failure is logged, never thrown at the caller. */
@Slf4j
@Component
@RequiredArgsConstructor
public class AmqpRealtimePublisher implements RealtimePublisher {

	private final RabbitTemplate rabbit;
	private final FanoutExchange realtimeExchange;
	private final JsonMapper json;

	@Override
	public void publish(RealtimeEvent event) {
		try {
			rabbit.convertAndSend(realtimeExchange.getName(), "", json.writeValueAsString(event));
		}
		catch (RuntimeException e) {
			log.warn("Could not publish a realtime event", e);
		}
	}

}
