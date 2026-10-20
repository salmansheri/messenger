package dev.salman.backend.dto;

import jakarta.validation.constraints.NotNull;

/** {@code emoji} must be one of the six reactions (see {@code Reactions}). */
public record SetReactionRequest(@NotNull String emoji) {
}
