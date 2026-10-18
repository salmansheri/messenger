package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.ParticipantSummary;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.User;
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

	List<ConversationResponse> assemble(List<Conversation> found, UUID viewerId) {
		if (found.isEmpty()) {
			return List.of();
		}
		var members = participants.findByConversationIdIn(found.stream().map(Conversation::getId).toList());
		var usersById = users.findAllById(members.stream().map(Participant::getUserId).distinct().toList()).stream()
				.collect(Collectors.toMap(User::getId, u -> u));
		var membersByConversation = members.stream().collect(Collectors.groupingBy(Participant::getConversationId));
		var latestByConversation = messages.findLatestIn(found.stream().map(Conversation::getId).toList()).stream()
				.collect(Collectors.toMap(Message::getConversationId, m -> m));
		return found.stream()
				.map(c -> toResponse(c, membersByConversation.get(c.getId()), usersById,
						visibleTo(viewerId, membersByConversation.get(c.getId()), latestByConversation.get(c.getId()))))
				.toList();
	}

	/** The latest Message, but only if the viewer joined before it was sent. */
	private static Message visibleTo(UUID viewerId, Collection<Participant> members, Message latest) {
		if (latest == null) {
			return null;
		}
		return members.stream().filter(m -> m.getUserId().equals(viewerId)).findFirst()
				.filter(viewer -> latest.getSeq() > viewer.getJoinedAfterSeq()).map(viewer -> latest).orElse(null);
	}

	private static ConversationResponse toResponse(Conversation conversation, Collection<Participant> members,
			Map<UUID, User> usersById, Message latest) {
		var summaries = members.stream()
				.sorted(Comparator.comparing(m -> m.getUserId().toString()))
				.map(m -> new ParticipantSummary(m.getUserId(), usersById.get(m.getUserId()).getDisplayName(),
						m.getRole()))
				.toList();
		return new ConversationResponse(conversation.getId(), conversation.getType(), conversation.getName(),
				summaries, latest == null ? null : MessageResponse.from(latest), conversation.getCreatedAt(),
				conversation.getUpdatedAt());
	}

}
