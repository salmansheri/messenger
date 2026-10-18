package dev.salman.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

import dev.salman.backend.lib.StompAuthInterceptor;
import dev.salman.backend.lib.StompSessions;
import lombok.RequiredArgsConstructor;

/**
 * STOMP over WebSocket at {@code /ws}. The handshake itself is public because a browser cannot put an Authorization
 * header on it; the access token is checked on the STOMP CONNECT frame instead (see {@link StompAuthInterceptor}).
 * Events reach clients through the in-memory broker; RabbitMQ carries them between server instances.
 */
@Configuration
@EnableWebSocketMessageBroker
@EnableScheduling
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

	private static final int MAX_FRAME_BYTES = 16 * 1024;

	private final AppProperties props;
	private final StompAuthInterceptor authInterceptor;
	private final StompSessions sessions;

	@Bean
	TaskScheduler taskScheduler() {
		var scheduler = new ThreadPoolTaskScheduler();
		scheduler.setPoolSize(2);
		scheduler.setThreadNamePrefix("scheduler-");
		return scheduler;
	}

	@Override
	public void registerStompEndpoints(StompEndpointRegistry registry) {
		registry.addEndpoint("/ws").setAllowedOrigins(props.cors().allowedOrigins().toArray(String[]::new));
	}

	@Override
	public void configureMessageBroker(MessageBrokerRegistry registry) {
		registry.enableSimpleBroker("/queue").setHeartbeatValue(new long[] { 10_000, 10_000 })
				.setTaskScheduler(taskScheduler());
		registry.setApplicationDestinationPrefixes("/app");
		registry.setUserDestinationPrefix("/user");
	}

	@Override
	public void configureClientInboundChannel(ChannelRegistration registration) {
		registration.interceptors(authInterceptor);
	}

	@Override
	public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
		registry.setMessageSizeLimit(MAX_FRAME_BYTES).setTimeToFirstMessage(10_000);
		sessions.register(registry);
	}

}
