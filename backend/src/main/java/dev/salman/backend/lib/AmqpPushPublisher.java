package dev.salman.backend.lib;

import java.util.UUID;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.PushAmqpConfig;
import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.dto.PushJob;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class AmqpPushPublisher implements PushPublisher {

	/** Header on dead-lettered messages saying what they are, so they can be told apart when replaying. */
	public static final String KIND = "kind";

	private final RabbitTemplate rabbit;
	private final JsonMapper json;

	@Override
	public void messageStored(UUID messageId) {
		try {
			rabbit.convertAndSend(PushAmqpConfig.MESSAGES, json.writeValueAsString(new PushJob(messageId, 1)));
		}
		catch (RuntimeException e) {
			log.warn("Could not queue a push job", e);
		}
	}

	@Override
	public void fanOutLater(PushJob job) {
		rabbit.convertAndSend(PushAmqpConfig.MESSAGES_RETRY, json.writeValueAsString(job));
	}

	@Override
	public void deliver(PushDelivery delivery) {
		rabbit.convertAndSend(PushAmqpConfig.DELIVERIES, json.writeValueAsString(delivery));
	}

	@Override
	public void retryLater(PushDelivery delivery) {
		rabbit.convertAndSend(PushAmqpConfig.DELIVERIES_RETRY, json.writeValueAsString(delivery));
	}

	@Override
	public void bury(PushJob job) {
		rabbit.convertAndSend(PushAmqpConfig.DEAD, json.writeValueAsString(job), message -> {
			message.getMessageProperties().setHeader(KIND, "job");
			return message;
		});
	}

	@Override
	public void bury(PushDelivery delivery) {
		rabbit.convertAndSend(PushAmqpConfig.DEAD, json.writeValueAsString(delivery), message -> {
			message.getMessageProperties().setHeader(KIND, "delivery");
			return message;
		});
	}

}
