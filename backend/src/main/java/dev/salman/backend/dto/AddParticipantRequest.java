package dev.salman.backend.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record AddParticipantRequest(@NotNull UUID userId) {
}
