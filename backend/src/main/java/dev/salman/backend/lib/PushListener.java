package dev.salman.backend.lib;

import java.util.UUID;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.PushAmqpConfig;
import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.service.PushService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/**
 * The push workers. A job that fails is logged and dropped rather than rejected back to the broker, which would
 * redeliver it forever; temporary provider failures are retried by {@link PushService} through the retry queue.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PushListener {

	private final PushService push;
	private final JsonMapper json;

	@RabbitListener(queues = PushAmqpConfig.MESSAGES)
	public void onMessageStored(String messageId) {
		try {
			push.fanOut(UUID.fromString(messageId));
		}
		catch (RuntimeException e) {
			log.warn("Could not fan out a push job", e);
		}
	}

	@RabbitListener(queues = PushAmqpConfig.DELIVERIES)
	public void onDelivery(String body) {
		try {
			push.deliver(json.readValue(body, PushDelivery.class));
		}
		catch (RuntimeException e) {
			log.warn("Could not deliver a push", e);
		}
	}

}
