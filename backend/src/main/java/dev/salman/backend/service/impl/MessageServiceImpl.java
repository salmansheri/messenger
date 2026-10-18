package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.MessagePage;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.SentMessage;
import dev.salman.backend.entity.Message;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.MessageService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MessageServiceImpl implements MessageService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final Clock clock;

	/**
	 * The Conversation row is locked while the Message is stored, so concurrent sends run one after another: the
	 * Sequence number is read and incremented in the same transaction that stores the Message (a failed send leaves
	 * no gap), and a concurrent retry sees the first send's Message instead of racing it.
	 */
	@Override
	@Transactional
	public SentMessage send(UUID callerId, UUID conversationId, UUID clientMessageId, String body) {
		requireParticipant(callerId, conversationId);
		var conversation = conversations.findByIdForUpdate(conversationId).orElseThrow(MessageServiceImpl::notFound);
		requireParticipant(callerId, conversationId); // again, under the lock: a removal may have just committed

		var existing = messages.findByConversationIdAndSenderIdAndClientMessageId(conversationId, callerId,
				clientMessageId);
		if (existing.isPresent()) {
			if (!existing.get().getBody().equals(body)) {
				throw new ConflictException("This client message ID was already used for a different message.");
			}
			return new SentMessage(MessageResponse.from(existing.get()), false);
		}

		var now = clock.instant();
		conversation.setLastSeq(conversation.getLastSeq() + 1);
		conversation.setUpdatedAt(now);
		var message = new Message();
		message.setConversationId(conversationId);
		message.setSeq(conversation.getLastSeq());
		message.setSenderId(callerId);
		message.setClientMessageId(clientMessageId);
		message.setBody(body);
		message.setCreatedAt(now);
		messages.save(message);
		return new SentMessage(MessageResponse.from(message), true);
	}

	@Override
	@Transactional(readOnly = true)
	public MessagePage history(UUID callerId, UUID conversationId, Long beforeSeq, Long afterSeq, int limit) {
		var joinedAfterSeq = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(MessageServiceImpl::notFound).getJoinedAfterSeq(); // first, so outsiders only see a 404
		if (beforeSeq != null && afterSeq != null) {
			throw new BadRequestException("Use either beforeSeq or afterSeq, not both.");
		}
		// One extra row tells whether more exist beyond this page. Nothing at or before the join point is visible.
		var fetch = Limit.of(limit + 1);
		List<Message> found;
		if (afterSeq != null) {
			found = messages.findByConversationIdAndSeqGreaterThanOrderBySeqAsc(conversationId,
					Math.max(afterSeq, joinedAfterSeq), fetch);
		}
		else {
			found = new ArrayList<>(beforeSeq != null
					? messages.findByConversationIdAndSeqGreaterThanAndSeqLessThanOrderBySeqDesc(conversationId,
							joinedAfterSeq, beforeSeq, fetch)
					: messages.findByConversationIdAndSeqGreaterThanOrderBySeqDesc(conversationId, joinedAfterSeq,
							fetch));
		}
		var hasMore = found.size() > limit;
		var page = new ArrayList<>(hasMore ? found.subList(0, limit) : found);
		if (afterSeq == null) {
			Collections.reverse(page); // fetched newest first, returned oldest first
		}
		return new MessagePage(page.stream().map(MessageResponse::from).toList(), hasMore);
	}

	/** A non-Participant gets the same answer as for a Conversation that does not exist. */
	private void requireParticipant(UUID callerId, UUID conversationId) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw notFound();
		}
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
