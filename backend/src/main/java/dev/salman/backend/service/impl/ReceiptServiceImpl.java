package dev.salman.backend.service.impl;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.ReceiptPositions;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.ReceiptService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ReceiptServiceImpl implements ReceiptService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final RealtimeEvents events;

	/**
	 * Needs no conversation lock: the latest Sequence number only ever grows, so a position that is valid when
	 * checked stays valid, and the update itself is a single atomic {@code greatest(...)} statement.
	 */
	@Override
	@Transactional
	public ReceiptResponse report(UUID callerId, UUID conversationId, Long deliveredSeq, Long readSeq) {
		if (deliveredSeq == null && readSeq == null) {
			throw new BadRequestException("Report deliveredSeq, readSeq or both.");
		}
		var before = participants.findPositions(conversationId, callerId).orElseThrow(ReceiptServiceImpl::notFound);
		var conversation = conversations.findById(conversationId).orElseThrow(ReceiptServiceImpl::notFound);
		long read = readSeq == null ? 0 : readSeq;
		long delivered = Math.max(deliveredSeq == null ? 0 : deliveredSeq, read); // reading implies receiving
		if (delivered > conversation.getLastSeq()) {
			throw new BadRequestException("Cannot confirm a message that has not been sent yet.");
		}
		participants.advanceReceipts(conversationId, callerId, delivered, read);
		var me = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(ReceiptServiceImpl::notFound);
		var withheld = messages.countWithheldUnread(callerId, List.of(conversationId)).stream()
				.mapToLong(MessageRepository.WithheldCount::getCount).sum();
		var response = new ReceiptResponse(me.getLastDeliveredSeq(), me.getLastReadSeq(),
				me.unreadCount(conversation.getLastSeq(), withheld));
		if (me.getLastDeliveredSeq() != before.getDeliveredSeq() || me.getLastReadSeq() != before.getReadSeq()) {
			events.receiptsChanged(conversationId, callerId,
					new ReceiptPositions(before.getDeliveredSeq(), before.getReadSeq()), response);
		}
		return response;
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
