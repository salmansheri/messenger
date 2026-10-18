package dev.salman.backend.lib;

import java.util.UUID;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.PushAmqpConfig;
import dev.salman.backend.dto.PushDelivery;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class AmqpPushPublisher implements PushPublisher {

	private final RabbitTemplate rabbit;
	private final JsonMapper json;

	@Override
	public void messageStored(UUID messageId) {
		try {
			rabbit.convertAndSend(PushAmqpConfig.MESSAGES, messageId.toString());
		}
		catch (RuntimeException e) {
			log.warn("Could not queue a push job", e);
		}
	}

	@Override
	public void deliver(PushDelivery delivery) {
		rabbit.convertAndSend(PushAmqpConfig.DELIVERIES, json.writeValueAsString(delivery));
	}

	@Override
	public void retryLater(PushDelivery delivery) {
		rabbit.convertAndSend(PushAmqpConfig.RETRY, json.writeValueAsString(delivery));
	}

}
