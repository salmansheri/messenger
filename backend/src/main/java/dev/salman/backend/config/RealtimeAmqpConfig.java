package dev.salman.backend.config;

import org.springframework.amqp.core.AnonymousQueue;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * One fanout exchange for the whole cluster, and one private, auto-deleted queue per server instance bound to it,
 * so every instance sees every event and can push it to its own sockets.
 */
@Configuration
public class RealtimeAmqpConfig {

	public static final String EXCHANGE = "messenger.events";

	@Bean
	FanoutExchange realtimeExchange() {
		return new FanoutExchange(EXCHANGE);
	}

	@Bean
	Queue realtimeQueue() {
		return new AnonymousQueue();
	}

	@Bean
	Binding realtimeBinding(FanoutExchange realtimeExchange, Queue realtimeQueue) {
		return BindingBuilder.bind(realtimeQueue).to(realtimeExchange);
	}

}
