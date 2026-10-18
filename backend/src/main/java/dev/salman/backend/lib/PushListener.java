package dev.salman.backend.lib;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.PushAmqpConfig;
import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.dto.PushJob;
import dev.salman.backend.service.PushService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/**
 * The push workers. {@link PushService} handles every expected failure itself (retry, then the dead-letter queue); an
 * exception that still gets out here means even that failed (the broker is down), and it is left to propagate so the
 * message is requeued instead of lost. Only a message that cannot be read at all is dropped, since it never will be.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PushListener {

	private final PushService push;
	private final JsonMapper json;

	@RabbitListener(queues = PushAmqpConfig.MESSAGES)
	public void onMessageStored(String body) {
		PushJob job;
		try {
			job = json.readValue(body, PushJob.class);
		}
		catch (RuntimeException e) {
			log.warn("Dropped a malformed push job", e);
			return;
		}
		push.fanOut(job);
	}

	@RabbitListener(queues = PushAmqpConfig.DELIVERIES)
	public void onDelivery(String body) {
		PushDelivery delivery;
		try {
			delivery = json.readValue(body, PushDelivery.class);
		}
		catch (RuntimeException e) {
			log.warn("Dropped a malformed push delivery", e);
			return;
		}
		push.deliver(delivery);
	}

}
