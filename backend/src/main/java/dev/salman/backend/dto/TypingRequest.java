package dev.salman.backend.dto;

import jakarta.validation.constraints.NotNull;

/** Sent over the socket: the caller started ({@code true}) or stopped ({@code false}) typing. */
public record TypingRequest(@NotNull Boolean typing) {
}
