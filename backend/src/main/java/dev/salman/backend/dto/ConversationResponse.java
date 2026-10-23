package dev.salman.backend.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.salman.backend.entity.ConversationType;

/**
 * A Conversation as one Participant sees it. {@code lastMessage} is null until something has been sent;
 * {@code unreadCount} is the latest Sequence number minus the viewer's read position. {@code settings} are the
 * viewer's own mute, archive and pin; nobody else sees them. {@code blocked} is true only for a Direct conversation whose
 * other Participant the viewer has blocked (the Blocked User never learns of it).
 */
public record ConversationResponse(UUID id, ConversationType type, String name, List<ParticipantSummary> participants,
		MessageResponse lastMessage, long unreadCount, ConversationSettings settings, boolean blocked,
		Instant createdAt, Instant updatedAt) {
}
