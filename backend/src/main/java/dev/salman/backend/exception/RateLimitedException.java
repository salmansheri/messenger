package dev.salman.backend.exception;

import java.time.Duration;

import org.springframework.http.HttpStatus;

public class RateLimitedException extends ApiException {

	public RateLimitedException(Duration retryAfter) {
		super(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later.");
		mutableHeaders().set("Retry-After", Long.toString(Math.max(1, retryAfter.toSeconds())));
	}

}
