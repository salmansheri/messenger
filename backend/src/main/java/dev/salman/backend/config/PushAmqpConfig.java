package dev.salman.backend.config;

import java.util.Map;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Durable work queues for push, on the default exchange (routing key = queue name). Work that must be retried waits
 * in a retry queue whose message TTL dead-letters it back to its work queue, so a retry delay never blocks a worker.
 * Work that ran out of attempts is parked on {@link #DEAD}, which nothing consumes: it is there to be inspected and
 * replayed.
 */
@Configuration
public class PushAmqpConfig {

	public static final String MESSAGES = "messenger.push.messages";
	public static final String MESSAGES_RETRY = "messenger.push.messages.retry";
	public static final String DELIVERIES = "messenger.push.deliveries";
	public static final String DELIVERIES_RETRY = "messenger.push.retry";
	public static final String DEAD = "messenger.push.dead";

	@Bean
	Queue pushMessagesQueue() {
		return QueueBuilder.durable(MESSAGES).build();
	}

	@Bean
	Queue pushMessagesRetryQueue(AppProperties props) {
		return retryQueue(MESSAGES_RETRY, MESSAGES, props);
	}

	@Bean
	Queue pushDeliveriesQueue() {
		return QueueBuilder.durable(DELIVERIES).build();
	}

	@Bean
	Queue pushDeliveriesRetryQueue(AppProperties props) {
		return retryQueue(DELIVERIES_RETRY, DELIVERIES, props);
	}

	@Bean
	Queue pushDeadQueue() {
		return QueueBuilder.durable(DEAD).build();
	}

	private static Queue retryQueue(String name, String backTo, AppProperties props) {
		return QueueBuilder.durable(name).withArguments(Map.of("x-message-ttl", props.push().retryDelay().toMillis(),
				"x-dead-letter-exchange", "", "x-dead-letter-routing-key", backTo)).build();
	}

}
