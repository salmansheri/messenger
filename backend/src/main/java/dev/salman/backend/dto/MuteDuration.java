package dev.salman.backend.dto;

import java.time.Duration;

/** How long to mute a Conversation for; {@code NONE} unmutes. */
public enum MuteDuration {

	NONE(null), EIGHT_HOURS(Duration.ofHours(8)), ONE_WEEK(Duration.ofDays(7)), ALWAYS(null);

	private final Duration length;

	MuteDuration(Duration length) {
		this.length = length;
	}

	public Duration length() {
		return length;
	}

}
