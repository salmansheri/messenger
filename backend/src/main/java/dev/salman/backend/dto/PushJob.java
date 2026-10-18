package dev.salman.backend.dto;

import java.util.UUID;

/** "Notify the offline recipients of this stored Message". {@code attempt} counts from 1. */
public record PushJob(UUID messageId, int attempt) {

	public PushJob nextAttempt() {
		return new PushJob(messageId, attempt + 1);
	}

}
