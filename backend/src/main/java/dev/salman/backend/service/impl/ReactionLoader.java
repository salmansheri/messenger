package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import dev.salman.backend.dto.ReactionView;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Reaction;
import dev.salman.backend.entity.UserBlock;
import dev.salman.backend.lib.Reactions;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.ReactionRepository;
import dev.salman.backend.repository.UserBlockRepository;
import lombok.RequiredArgsConstructor;

/**
 * Reads the reactions of a page or list of Messages in one query and groups them by emoji, as one viewer sees them:
 * while a viewer blocks someone, that person's reactions in their Direct conversation are hidden from the viewer
 * (ADR 0006), and show again as they stand once the Block is lifted. Groups hide nothing.
 */
@Component
@RequiredArgsConstructor
class ReactionLoader {

	private final ReactionRepository reactions;
	private final UserBlockRepository blocks;
	private final ConversationRepository conversations;

	/** A reactor whose reactions in a Conversation a viewer does not see. */
	private record Hidden(UUID viewerId, UUID reactorId, UUID conversationId) {
	}

	/**
	 * The reactions of each Message by its id, as the viewer sees them; a Message with none, or one deleted for
	 * everyone, has an empty list.
	 */
	Map<UUID, List<ReactionView>> of(Collection<Message> shown, UUID viewerId) {
		var found = load(shown);
		return grouped(found, seenBy(viewerId, hidden(found, Set.of(viewerId))));
	}

	/** One Message's reactions as each of the viewers sees them, by viewer, in a fixed number of queries. */
	Map<UUID, List<ReactionView>> ofEach(Message message, Collection<UUID> viewerIds) {
		var found = load(List.of(message));
		var hidden = hidden(found, viewerIds);
		var everyone = grouped(found, r -> true).getOrDefault(message.getId(), List.of());
		var hiding = hidden.stream().map(Hidden::viewerId).collect(Collectors.toSet());
		var seen = new LinkedHashMap<UUID, List<ReactionView>>();
		for (var viewerId : viewerIds) {
			// Grouped once for everyone; again only for the rare viewer who blocks one of the reactors.
			seen.put(viewerId, !hiding.contains(viewerId) ? everyone
					: grouped(found, seenBy(viewerId, hidden)).getOrDefault(message.getId(), List.of()));
		}
		return seen;
	}

	private static Predicate<Reaction> seenBy(UUID viewerId, Set<Hidden> hidden) {
		return r -> !hidden.contains(new Hidden(viewerId, r.getUserId(), r.getConversationId()));
	}

	private List<Reaction> load(Collection<Message> shown) {
		var alive = shown.stream().filter(message -> !message.isDeleted()).map(Message::getId).toList();
		return alive.isEmpty() ? List.of() : reactions.findByMessageIdInOrderByCreatedAtAscIdAsc(alive);
	}

	/**
	 * Which viewers do not see which reactors, and where: a viewer who blocks the reactor, in a Direct conversation.
	 * One query when no viewer blocks any reactor (almost always), two otherwise.
	 */
	private Set<Hidden> hidden(List<Reaction> found, Collection<UUID> viewerIds) {
		if (found.isEmpty()) {
			return Set.of();
		}
		var pairs = blocks.findByBlockerIdInAndBlockedIdIn(viewerIds,
				found.stream().map(Reaction::getUserId).collect(Collectors.toSet()));
		if (pairs.isEmpty()) {
			return Set.of();
		}
		var direct = Set.copyOf(conversations.findDirectAmong(
				found.stream().map(Reaction::getConversationId).collect(Collectors.toSet())));
		var hidden = new HashSet<Hidden>();
		for (var reaction : found) {
			if (direct.contains(reaction.getConversationId())) {
				pairs.stream().filter(b -> b.getBlockedId().equals(reaction.getUserId())).map(UserBlock::getBlockerId)
						.forEach(viewer -> hidden.add(new Hidden(viewer, reaction.getUserId(), reaction.getConversationId())));
			}
		}
		return hidden;
	}

	private static Map<UUID, List<ReactionView>> grouped(List<Reaction> found, Predicate<Reaction> shownToViewer) {
		return found.stream().filter(shownToViewer)
				.collect(Collectors.groupingBy(Reaction::getMessageId, LinkedHashMap::new, Collectors.collectingAndThen(
						Collectors.toList(), ReactionLoader::byEmoji)));
	}

	/** One entry per emoji, in the order the emoji are offered, each with the people who chose it in the order they did. */
	private static List<ReactionView> byEmoji(List<Reaction> ofOneMessage) {
		return Reactions.ALLOWED.stream()
				.map(emoji -> new ReactionView(emoji,
						ofOneMessage.stream().filter(r -> r.getEmoji().equals(emoji)).map(Reaction::getUserId).toList()))
				.filter(view -> !view.userIds().isEmpty()).toList();
	}

}
