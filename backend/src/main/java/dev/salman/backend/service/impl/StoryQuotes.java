package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import dev.salman.backend.dto.StoryQuote;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Story;
import dev.salman.backend.entity.StoryKind;
import dev.salman.backend.lib.Previews;
import dev.salman.backend.repository.StoryRepository;
import lombok.RequiredArgsConstructor;

/** Finds the Stories a page or list of Messages answers, in one query, and words their quotes. */
@Component
@RequiredArgsConstructor
class StoryQuotes {

	private final StoryRepository stories;
	private final Clock clock;

	/**
	 * The quote of each Message that answers a Story, by the Message's id. A Message that answers none, or is deleted
	 * for everyone, is left out.
	 */
	Map<UUID, StoryQuote> of(Collection<Message> shown) {
		var replies = shown.stream().filter(message -> message.isRepliedToStory() && !message.isDeleted()).toList();
		if (replies.isEmpty()) {
			return Map.of();
		}
		var byId = stories.findAllById(replies.stream().map(Message::getReplyToStoryId).filter(Objects::nonNull)
				.distinct().toList()).stream().collect(Collectors.toMap(Story::getId, Function.identity()));
		var now = clock.instant();
		var quotes = new HashMap<UUID, StoryQuote>();
		for (var message : replies) {
			var story = message.getReplyToStoryId() == null ? null : byId.get(message.getReplyToStoryId());
			var live = story != null && story.getDeletedAt() == null && story.getExpiresAt().isAfter(now);
			quotes.put(message.getId(), live ? quoteOf(story) : StoryQuote.UNAVAILABLE);
		}
		return quotes;
	}

	private static StoryQuote quoteOf(Story story) {
		var text = story.getKind() == StoryKind.PHOTO
				? Previews.of(story.getText(), true, QuoteResolver.QUOTE_CHARACTERS)
				: Previews.firstCharacters(story.getText(), QuoteResolver.QUOTE_CHARACTERS);
		return new StoryQuote(story.getId(), story.getKind(), text, false);
	}

}
