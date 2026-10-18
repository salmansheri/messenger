package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.StartedConversation;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.ConversationType;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.ParticipantRole;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.ConversationService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ConversationServiceImpl implements ConversationService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final ConversationAssembler assembler;
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
			return new StartedConversation(assembler.assemble(List.of(existing.get()), callerId).getFirst(), false);
		}

		var now = clock.instant();
		var conversation = new Conversation();
		conversation.setType(ConversationType.DIRECT);
		conversation.setDirectKey(key);
		conversation.setCreatedAt(now);
		conversation.setUpdatedAt(now);
		conversations.save(conversation);
		for (var userId : List.of(callerId, otherUserId)) {
			participants.save(Participant.joining(conversation.getId(), userId, ParticipantRole.MEMBER, now, 0));
		}
		return new StartedConversation(assembler.assemble(List.of(conversation), callerId).getFirst(), true);
	}

	@Override
	@Transactional(readOnly = true)
	public List<ConversationResponse> listFor(UUID callerId) {
		return assembler.assemble(conversations.findAllForUser(callerId), callerId);
	}

	@Override
	@Transactional(readOnly = true)
	public ConversationResponse get(UUID callerId, UUID conversationId) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw new NotFoundException("Conversation not found.");
		}
		var conversation = conversations.findById(conversationId)
				.orElseThrow(() -> new NotFoundException("Conversation not found."));
		return assembler.assemble(List.of(conversation), callerId).getFirst();
	}

	/** Both User ids in a fixed order, so the key is the same whichever User starts the conversation. */
	private static String directKey(UUID first, UUID second) {
		var a = first.toString();
		var b = second.toString();
		return a.compareTo(b) < 0 ? a + ":" + b : b + ":" + a;
	}

}
