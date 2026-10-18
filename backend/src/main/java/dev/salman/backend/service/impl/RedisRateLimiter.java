package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.List;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import dev.salman.backend.exception.RateLimitedException;
import dev.salman.backend.service.RateLimiter;
import lombok.RequiredArgsConstructor;

/** One Lua script increments the counter and guarantees it has a TTL, so a counter can never outlive its window. */
@Service
@RequiredArgsConstructor
public class RedisRateLimiter implements RateLimiter {

	/** KEYS: counter. ARGV: window millis. Returns {hits, millis until the window ends}. */
	@SuppressWarnings("rawtypes")
	private static final RedisScript<List> COUNT = new DefaultRedisScript<>("""
			local hits = redis.call('INCR', KEYS[1])
			if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
			return {hits, redis.call('PTTL', KEYS[1])}
			""", List.class);

	private final StringRedisTemplate redis;

	@Override
	public void hit(String key, int limit, Duration window) {
		List<?> result = redis.execute(COUNT, List.of(key), String.valueOf(window.toMillis()));
		var hits = ((Number) result.get(0)).longValue();
		if (hits > limit) {
			var millisLeft = ((Number) result.get(1)).longValue();
			throw new RateLimitedException(Duration.ofMillis(millisLeft > 0 ? millisLeft : window.toMillis()));
		}
	}

}
