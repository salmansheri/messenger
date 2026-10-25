package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

/** Someone who viewed a Story, and when they first did, as its poster sees them. {@code avatarUrl} is null for none. */
public record StoryViewer(UUID userId, String displayName, String avatarUrl, Instant viewedAt) {
}
