package dev.salman.backend.dto;

/** Only what is present changes. {@code archived} and {@code pinned} cannot both be asked to become true. */
public record UpdateSettingsRequest(MuteDuration mute, Boolean archived, Boolean pinned) {
}
