package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import dev.salman.backend.dto.ReactionView;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Reaction;
import dev.salman.backend.lib.Reactions;
import dev.salman.backend.repository.ReactionRepository;
import lombok.RequiredArgsConstructor;

/** Reads the reactions of a page or list of Messages in one query and groups them by emoji. */
@Component
@RequiredArgsConstructor
class ReactionLoader {

	private final ReactionRepository reactions;

	/** The reactions of each Message by its id; a Message with none, or one deleted for everyone, has an empty list. */
	Map<UUID, List<ReactionView>> of(Collection<Message> shown) {
		var alive = shown.stream().filter(message -> !message.isDeleted()).map(Message::getId).toList();
		if (alive.isEmpty()) {
			return Map.of();
		}
		return reactions.findByMessageIdInOrderByCreatedAtAscIdAsc(alive).stream()
				.collect(Collectors.groupingBy(Reaction::getMessageId, LinkedHashMap::new, Collectors.collectingAndThen(
						Collectors.toList(), ReactionLoader::grouped)));
	}

	/** One entry per emoji, in the order the emoji are offered, each with the people who chose it in the order they did. */
	private static List<ReactionView> grouped(List<Reaction> ofOneMessage) {
		return Reactions.ALLOWED.stream()
				.map(emoji -> new ReactionView(emoji,
						ofOneMessage.stream().filter(r -> r.getEmoji().equals(emoji)).map(Reaction::getUserId).toList()))
				.filter(view -> !view.userIds().isEmpty()).toList();
	}

}
