package dev.salman.backend.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.salman.backend.entity.ConversationType;

/** A Conversation as its Participants see it. Latest-message and unread information arrive with Messages. */
public record ConversationResponse(UUID id, ConversationType type, String name, List<ParticipantSummary> participants,
		Instant createdAt, Instant updatedAt) {
}
