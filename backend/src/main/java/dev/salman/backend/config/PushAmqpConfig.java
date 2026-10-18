package dev.salman.backend.config;

import java.util.Map;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Durable work queues for push, on the default exchange (routing key = queue name). Deliveries that must be retried
 * wait in the retry queue, whose message TTL dead-letters them back to the deliveries queue, so a retry delay never
 * blocks a worker.
 */
@Configuration
public class PushAmqpConfig {

	public static final String MESSAGES = "messenger.push.messages";
	public static final String DELIVERIES = "messenger.push.deliveries";
	public static final String RETRY = "messenger.push.retry";

	@Bean
	Queue pushMessagesQueue() {
		return QueueBuilder.durable(MESSAGES).build();
	}

	@Bean
	Queue pushDeliveriesQueue() {
		return QueueBuilder.durable(DELIVERIES).build();
	}

	@Bean
	Queue pushRetryQueue(AppProperties props) {
		return QueueBuilder.durable(RETRY).withArguments(Map.of("x-message-ttl",
				props.push().retryDelay().toMillis(), "x-dead-letter-exchange", "", "x-dead-letter-routing-key",
				DELIVERIES)).build();
	}

}
