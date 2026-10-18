package dev.salman.backend.dto;

import java.util.UUID;

/**
 * One notification for one device, as queued. {@code userId} is who owned the device when it was queued, so a token
 * that has since moved to someone else is never deleted from them. {@code attempt} counts from 1.
 */
public record PushDelivery(UUID deviceId, UUID userId, String token, String title, String body, int attempt) {

	public PushDelivery nextAttempt() {
		return new PushDelivery(deviceId, userId, token, title, body, attempt + 1);
	}

}
