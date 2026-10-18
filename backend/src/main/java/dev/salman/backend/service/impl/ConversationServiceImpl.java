package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.ParticipantSummary;
import dev.salman.backend.dto.StartedConversation;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.ConversationType;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.ConversationService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ConversationServiceImpl implements ConversationService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final UserRepository users;
	private final Clock clock;

	@Override
	@Transactional
	public StartedConversation startDirect(UUID callerId, UUID otherUserId) {
		if (callerId.equals(otherUserId)) {
			throw new BadRequestException("You cannot start a conversation with yourself.");
		}
		users.findById(callerId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		users.findById(otherUserId).filter(User::isEmailVerified)
				.orElseThrow(() -> new NotFoundException("No user found."));

		var key = directKey(callerId, otherUserId);
		conversations.lockDirectKey(key);
		var existing = conversations.findByDirectKey(key);
		if (existing.isPresent()) {
			return new StartedConversation(toResponses(List.of(existing.get())).getFirst(), false);
		}

		var now = clock.instant();
		var conversation = new Conversation();
		conversation.setType(ConversationType.DIRECT);
		conversation.setDirectKey(key);
		conversation.setCreatedAt(now);
		conversation.setUpdatedAt(now);
		conversations.save(conversation);
		for (var userId : List.of(callerId, otherUserId)) {
			var participant = new Participant();
			participant.setConversationId(conversation.getId());
			participant.setUserId(userId);
			participant.setJoinedAt(now);
			participants.save(participant);
		}
		return new StartedConversation(toResponses(List.of(conversation)).getFirst(), true);
	}

	@Override
	@Transactional(readOnly = true)
	public List<ConversationResponse> listFor(UUID callerId) {
		return toResponses(conversations.findAllForUser(callerId));
	}

	/** Both User ids in a fixed order, so the key is the same whichever User starts the conversation. */
	private static String directKey(UUID first, UUID second) {
		var a = first.toString();
		var b = second.toString();
		return a.compareTo(b) < 0 ? a + ":" + b : b + ":" + a;
	}

	/** Builds responses for the given Conversations with four queries however many there are. */
	private List<ConversationResponse> toResponses(List<Conversation> found) {
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
						latestByConversation.get(c.getId())))
				.toList();
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
