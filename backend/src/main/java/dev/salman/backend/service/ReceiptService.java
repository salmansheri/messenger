package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.ReceiptResponse;

public interface ReceiptService {

	/**
	 * Moves the caller's delivered and/or read position forward. A position never goes backwards: a lower value, or
	 * one that arrives late, is ignored without error. Reporting a Message as read also reports it as delivered.
	 *
	 * @throws dev.salman.backend.exception.BadRequestException when neither position is given, or one is beyond
	 *         the latest Message
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 */
	ReceiptResponse report(UUID callerId, UUID conversationId, Long deliveredSeq, Long readSeq);

}
