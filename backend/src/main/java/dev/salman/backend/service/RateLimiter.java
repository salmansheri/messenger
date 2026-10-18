package dev.salman.backend.service;

import java.time.Duration;

/** Fixed-window rate limiting by key. */
public interface RateLimiter {

	/**
	 * Counts one hit against {@code key}. The first hit starts the window; hits beyond {@code limit} within it are
	 * refused.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the limit is exceeded, carrying the time left
	 *         in the window
	 */
	void hit(String key, int limit, Duration window);

}
