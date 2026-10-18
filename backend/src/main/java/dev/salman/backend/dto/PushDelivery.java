package dev.salman.backend.dto;

/** One notification for one device, as queued. {@code attempt} counts from 1. */
public record PushDelivery(String token, String title, String body, int attempt) {

	public PushDelivery nextAttempt() {
		return new PushDelivery(token, title, body, attempt + 1);
	}

}
