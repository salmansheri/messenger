package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

import dev.salman.backend.entity.Story;
import dev.salman.backend.entity.StoryKind;
import dev.salman.backend.entity.StoryTone;

/** One Story as its poster and its audience see it: a text on {@code tone}, or a photo with {@code text} as its caption. */
public record StoryResponse(UUID id, UUID posterId, StoryKind kind, String text, StoryTone tone,
		AttachmentResponse attachment, Instant createdAt, Instant expiresAt, boolean seen,
		@JsonInclude(JsonInclude.Include.NON_NULL) Long viewCount) {

	/**
	 * {@code attachment} is the photo with freshly signed links, null for a text Story. {@code seen} is whether the
	 * reader has viewed it (always true for the poster); {@code viewCount} is given to the poster only, null otherwise.
	 */
	public static StoryResponse from(Story story, AttachmentResponse attachment, boolean seen, Long viewCount) {
		return new StoryResponse(story.getId(), story.getPosterId(), story.getKind(), story.getText(), story.getTone(),
				attachment, story.getCreatedAt(), story.getExpiresAt(), seen, viewCount);
	}

	/** The same Story as its poster sees it: seen, with {@code viewCount}. */
	public StoryResponse forPoster(long viewCount) {
		return new StoryResponse(id, posterId, kind, text, tone, attachment, createdAt, expiresAt, true, viewCount);
	}

}
