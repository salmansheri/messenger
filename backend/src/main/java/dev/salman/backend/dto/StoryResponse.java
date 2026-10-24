package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

import dev.salman.backend.entity.Story;
import dev.salman.backend.entity.StoryKind;
import dev.salman.backend.entity.StoryTone;

/** One Story as its poster and its audience see it. */
public record StoryResponse(UUID id, UUID posterId, StoryKind kind, String text, StoryTone tone, Instant createdAt,
		Instant expiresAt) {

	public static StoryResponse from(Story story) {
		return new StoryResponse(story.getId(), story.getPosterId(), story.getKind(), story.getText(), story.getTone(),
				story.getCreatedAt(), story.getExpiresAt());
	}

}
