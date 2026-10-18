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
import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.dto.ReceiptPositions;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.dto.SentMessage;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.MessageService;
import dev.salman.backend.service.PushService;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MessageServiceImpl implements MessageService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final RealtimeEvents events;
	private final PushService push;
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
			return new SentMessage(MessageResponse.from(existing.get(), statusFor(existing.get(), callerId)), false);
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
		// Sending shows the sender has seen the conversation up to here, so their own message is never "unread".
		var before = participants.findPositions(conversationId, callerId).orElseThrow(MessageServiceImpl::notFound);
		participants.advanceReceipts(conversationId, callerId, message.getSeq(), message.getSeq());
		events.messageCreated(message);
		push.messageStored(message);
		if (before.getDeliveredSeq() != message.getSeq() || before.getReadSeq() != message.getSeq()) {
			// Replying counts as having read everything up to it: tell whose messages that reached, and this
			// sender's other devices that nothing is unread any more.
			events.receiptsChanged(conversationId, callerId,
					new ReceiptPositions(before.getDeliveredSeq(), before.getReadSeq()),
					new ReceiptResponse(message.getSeq(), message.getSeq(), 0));
		}
		// Nobody can report a position that did not exist before this send, so a new Message is always still SENT.
		return new SentMessage(MessageResponse.from(message, MessageStatus.SENT), true);
	}

	@Override
	@Transactional(readOnly = true)
	public MessagePage history(UUID callerId, UUID conversationId, Long beforeSeq, Long afterSeq, int limit) {
		var reader = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(MessageServiceImpl::notFound); // first, so outsiders only see a 404
		if (beforeSeq != null && afterSeq != null) {
			throw new BadRequestException("Use either beforeSeq or afterSeq, not both.");
		}
		// One extra row tells whether more exist beyond this page. Nothing at or before the join point is visible.
		var fetch = Limit.of(limit + 1);
		List<Message> found;
		if (afterSeq != null) {
			found = messages.findByConversationIdAndSeqGreaterThanOrderBySeqAsc(conversationId,
					reader.readableAfter(afterSeq), fetch);
		}
		else {
			found = new ArrayList<>(beforeSeq != null
					? messages.findByConversationIdAndSeqGreaterThanAndSeqLessThanOrderBySeqDesc(conversationId,
							reader.readableAfter(0), beforeSeq, fetch)
					: messages.findByConversationIdAndSeqGreaterThanOrderBySeqDesc(conversationId,
							reader.readableAfter(0), fetch));
		}
		var hasMore = found.size() > limit;
		var page = new ArrayList<>(hasMore ? found.subList(0, limit) : found);
		if (afterSeq == null) {
			Collections.reverse(page); // fetched newest first, returned oldest first
		}
		var members = page.stream().anyMatch(m -> m.getSenderId().equals(callerId))
				? participants.findByConversationId(conversationId) : List.<Participant>of();
		return new MessagePage(
				page.stream().map(m -> MessageResponse.from(m, MessageStatuses.of(m, callerId, members))).toList(),
				hasMore);
	}

	private MessageStatus statusFor(Message message, UUID callerId) {
		return MessageStatuses.of(message, callerId, participants.findByConversationId(message.getConversationId()));
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
