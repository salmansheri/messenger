package dev.salman.backend.service.impl;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.ReceiptService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ReceiptServiceImpl implements ReceiptService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;

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
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw notFound();
		}
		var conversation = conversations.findById(conversationId).orElseThrow(ReceiptServiceImpl::notFound);
		long read = readSeq == null ? 0 : readSeq;
		long delivered = Math.max(deliveredSeq == null ? 0 : deliveredSeq, read); // reading implies receiving
		if (delivered > conversation.getLastSeq()) {
			throw new BadRequestException("Cannot confirm a message that has not been sent yet.");
		}
		participants.advanceReceipts(conversationId, callerId, delivered, read);
		var me = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(ReceiptServiceImpl::notFound);
		return new ReceiptResponse(me.getLastDeliveredSeq(), me.getLastReadSeq(),
				Math.max(0, conversation.getLastSeq() - me.getLastReadSeq()));
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
