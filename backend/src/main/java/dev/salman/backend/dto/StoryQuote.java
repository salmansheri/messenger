package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.entity.StoryKind;

/**
 * The Story a Message answers, as the Message shows it: {@code text} is "Photo", "Photo: " and the start of the
 * caption, or the start of a text Story. Once the Story has expired or been deleted the quote is {@code unavailable}
 * and carries nothing else.
 */
public record StoryQuote(UUID storyId, StoryKind kind, String text, boolean unavailable) {

	public static final StoryQuote UNAVAILABLE = new StoryQuote(null, null, null, true);

}
