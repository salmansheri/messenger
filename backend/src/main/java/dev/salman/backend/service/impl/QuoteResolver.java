package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import dev.salman.backend.dto.ReplyQuote;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.lib.Previews;
import dev.salman.backend.repository.MessageHiddenRepository;
import dev.salman.backend.repository.MessageRepository;
import lombok.RequiredArgsConstructor;

/** Works out what a reply shows of the Message it answers, for one viewer, from the quoted Message as it is now. */
@Component
@RequiredArgsConstructor
class QuoteResolver {

	/** A quote shows the start of the text, like a push notification does. */
	static final int QUOTE_CHARACTERS = 100;

	private final MessageRepository messages;
	private final MessageHiddenRepository hidden;

	/**
	 * The quotes of the replies among {@code shown}, by the reply's id, in one query however many there are.
	 * {@code viewerIn} gives the viewer's Participant in a Conversation (null if they have none there). A reply that
	 * was deleted has no quote.
	 */
	Map<UUID, ReplyQuote> resolve(Collection<Message> shown, Function<UUID, Participant> viewerIn) {
		var replies = shown.stream().filter(message -> message.getReplyToId() != null && !message.isDeleted()).toList();
		if (replies.isEmpty()) {
			return Map.of();
		}
		var quoted = messages.findAllById(replies.stream().map(Message::getReplyToId).distinct().toList()).stream()
				.collect(Collectors.toMap(Message::getId, message -> message));
		var hiddenByViewer = new HashMap<UUID, Set<UUID>>(); // what each viewer hid, asked once per viewer
		var quotes = new HashMap<UUID, ReplyQuote>();
		for (var reply : replies) {
			var original = quoted.get(reply.getReplyToId());
			var viewer = viewerIn.apply(reply.getConversationId());
			if (original != null && viewer != null) {
				var hid = hiddenByViewer.computeIfAbsent(viewer.getUserId(),
						user -> Set.copyOf(hidden.findHiddenAmong(user, quoted.keySet())));
				quotes.put(reply.getId(), quoteFor(original, viewer, hid.contains(original.getId())));
			}
		}
		return quotes;
	}

	/** The Message a reply answers, if it is a reply that has not been deleted. */
	Optional<Message> quotedBy(Message reply) {
		return reply.getReplyToId() == null || reply.isDeleted() ? Optional.empty() : messages.findById(reply.getReplyToId());
	}

	/** The Users who hid the quoted Message from their own view. */
	Set<UUID> hiddenBy(Message quoted) {
		return Set.copyOf(hidden.findUserIdsWhoHid(quoted.getId()));
	}

	/**
	 * How the viewer sees the quoted Message: its text, a deleted marker, or nothing at all when it is from before they
	 * joined or they hid it from their own view (a quote must not bring back what they chose not to see).
	 */
	static ReplyQuote quoteFor(Message quoted, Participant viewer, boolean hiddenByViewer) {
		if (hiddenByViewer || !viewer.canRead(quoted.getSeq())) {
			return new ReplyQuote(quoted.getId(), null, null, false, true);
		}
		if (quoted.isDeleted()) {
			return new ReplyQuote(quoted.getId(), quoted.getSenderId(), null, true, false);
		}
		return new ReplyQuote(quoted.getId(), quoted.getSenderId(),
				Previews.of(quoted.getBody(), quoted.getAttachmentId() != null, QUOTE_CHARACTERS), false, false);
	}

}
