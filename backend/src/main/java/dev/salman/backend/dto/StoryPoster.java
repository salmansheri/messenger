package dev.salman.backend.dto;

import java.util.UUID;

/** Who posted a Story, as a {@code story.posted} event names them. {@code avatarUrl} is null for none. */
public record StoryPoster(UUID userId, String displayName, String avatarUrl) {
}
