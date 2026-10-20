package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.service.MessageThrottle;
import dev.salman.backend.service.RateLimiter;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MessageThrottleImpl implements MessageThrottle {

	private static final Duration WINDOW = Duration.ofMinutes(1);

	private final RateLimiter rateLimiter;
	private final AppProperties props;

	@Override
	public void send(UUID userId) {
		rateLimiter.hit("rl:message-send:" + userId, props.messages().maxSendsPerMinute(), WINDOW);
	}

	@Override
	public void change(UUID userId) {
		rateLimiter.hit("rl:message-change:" + userId, props.messages().maxChangesPerMinute(), WINDOW);
	}

}
