package dev.salman.backend.dto;

import java.time.Instant;

import dev.salman.backend.entity.Participant;

/**
 * One Participant's private settings for a Conversation. {@code muted} with no {@code mutedUntil} means muted for
 * ever; a mute that has run out is simply not muted.
 */
public record ConversationSettings(boolean muted, Instant mutedUntil, boolean archived, boolean pinned) {

	/** The Participant's settings as they read at {@code now}. */
	public static ConversationSettings of(Participant participant, Instant now) {
		var muted = participant.isMuted(now);
		return new ConversationSettings(muted, muted && !participant.isMutedForever() ? participant.getMutedUntil() : null,
				participant.isArchived(), participant.isPinned());
	}

}
