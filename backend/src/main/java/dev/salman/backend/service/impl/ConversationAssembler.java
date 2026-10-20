package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.ConversationSettings;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.ParticipantSummary;
import dev.salman.backend.dto.ReactionView;
import dev.salman.backend.dto.ReplyQuote;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.ParticipantRole;
import dev.salman.backend.entity.User;
import dev.salman.backend.repository.MessageHiddenRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/** Builds {@link ConversationResponse}s as one viewer sees them, with four queries however many there are. */
@Component
@RequiredArgsConstructor
class ConversationAssembler {

	private final ParticipantRepository participants;
	private final UserRepository users;
	private final MessageRepository messages;
	private final MessageHiddenRepository hidden;
	private final Clock clock;
	private final QuoteResolver quotes;
	private final ReactionLoader reactionLoader;

	List<ConversationResponse> assemble(List<Conversation> found, UUID viewerId) {
		if (found.isEmpty()) {
			return List.of();
		}
		var members = participants.findByConversationIdIn(found.stream().map(Conversation::getId).toList());
		var usersById = users.findAllById(members.stream().map(Participant::getUserId).distinct().toList()).stream()
				.collect(Collectors.toMap(User::getId, u -> u));
		var membersByConversation = members.stream().collect(Collectors.groupingBy(Participant::getConversationId));
		var latestByConversation = latestVisible(found, members, viewerId);
		var now = clock.instant();
		var reacted = reactionLoader.of(latestByConversation.values());
		var quoted = quotes.resolve(latestByConversation.values(), conversationId -> membersByConversation
				.getOrDefault(conversationId, List.of()).stream().filter(m -> m.getUserId().equals(viewerId)).findFirst().orElse(null));
		return found.stream()
				.map(c -> toResponse(c, viewerId, membersByConversation.get(c.getId()), usersById,
						latestByConversation.get(c.getId()), quoted, reacted, now))
				.toList();
	}

	/**
	 * The latest Message of each Conversation that the viewer has not hidden. Almost always that is simply the
	 * latest one; only when the viewer hid it is the Conversation asked again for the one before.
	 */
	private Map<UUID, Message> latestVisible(List<Conversation> found, List<Participant> members, UUID viewerId) {
		var latest = messages.findLatestIn(found.stream().map(Conversation::getId).toList());
		var hiddenIds = Set.copyOf(hidden.findHiddenAmong(viewerId, latest.stream().map(Message::getId).toList()));
		var visible = new HashMap<UUID, Message>();
		for (var message : latest) {
			if (!hiddenIds.contains(message.getId())) {
				visible.put(message.getConversationId(), message);
				continue;
			}
			members.stream().filter(m -> m.getConversationId().equals(message.getConversationId())
					&& m.getUserId().equals(viewerId)).findFirst()
					.flatMap(viewer -> messages.findVisibleNewest(message.getConversationId(), viewerId,
							viewer.readableAfter(0), Limit.of(1)).stream().findFirst())
					.ifPresent(earlier -> visible.put(earlier.getConversationId(), earlier));
		}
		return visible;
	}

	private static ConversationResponse toResponse(Conversation conversation, UUID viewerId,
			Collection<Participant> members, Map<UUID, User> usersById, Message latestMessage,
			Map<UUID, ReplyQuote> quoted, Map<UUID, List<ReactionView>> reacted, Instant now) {
		var viewer = members.stream().filter(m -> m.getUserId().equals(viewerId)).findFirst();
		var latest = viewer.filter(v -> latestMessage != null && v.canRead(latestMessage.getSeq()))
				.map(v -> latestMessage).orElse(null);
		var unread = viewer.map(v -> v.unreadCount(conversation.getLastSeq())).orElse(0L);
		var summaries = members.stream()
				.sorted(Comparator.comparing((Participant m) -> m.getRole() != ParticipantRole.ADMIN)
						.thenComparing(Participant::getJoinedAt).thenComparing(m -> m.getUserId().toString()))
				.map(m -> new ParticipantSummary(m.getUserId(), usersById.get(m.getUserId()).getDisplayName(),
						m.getRole()))
				.toList();
		return new ConversationResponse(conversation.getId(), conversation.getType(), conversation.getName(),
				summaries,
				latest == null ? null
						: MessageResponse.from(latest, MessageStatuses.of(latest, viewerId, members), quoted.get(latest.getId()),
								reacted.getOrDefault(latest.getId(), List.of())),
				unread, viewer.map(v -> ConversationSettings.of(v, now)).orElse(new ConversationSettings(false, null, false, false)),
				conversation.getCreatedAt(), conversation.getUpdatedAt());
	}

}
