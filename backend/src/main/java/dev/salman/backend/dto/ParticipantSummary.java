package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.entity.ParticipantRole;

public record ParticipantSummary(UUID userId, String displayName, ParticipantRole role) {
}
