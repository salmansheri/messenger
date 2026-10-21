package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.entity.ParticipantRole;

/** {@code avatarUrl}: a signed link to the Participant's avatar (null for none), given only to people who share the Conversation. */
public record ParticipantSummary(UUID userId, String displayName, ParticipantRole role, String avatarUrl) {
}
