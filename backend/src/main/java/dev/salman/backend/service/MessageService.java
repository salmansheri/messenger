package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.MessagePage;
import dev.salman.backend.dto.SentMessage;

public interface MessageService {

	/**
	 * Stores a Message from the caller and gives it the next Sequence number. Sending again with the same Client
	 * message ID and text returns the stored Message instead of creating another.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant (or the
	 *         Conversation does not exist: the two look the same)
	 * @throws dev.salman.backend.exception.ConflictException when the Client message ID was already used for
	 *         different text
	 */
	SentMessage send(UUID callerId, UUID conversationId, UUID clientMessageId, String body);

	/**
	 * A page of the Conversation's Messages, always in ascending Sequence order, at most {@code limit} long:
	 * <ul>
	 * <li>neither cursor: the newest Messages;</li>
	 * <li>{@code beforeSeq}: the newest Messages older than it (paging back); {@code hasMore} says older ones remain;</li>
	 * <li>{@code afterSeq}: the oldest Messages newer than it (catching up); {@code hasMore} says newer ones remain.</li>
	 * </ul>
	 *
	 * @throws dev.salman.backend.exception.BadRequestException when both cursors are given
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 */
	MessagePage history(UUID callerId, UUID conversationId, Long beforeSeq, Long afterSeq, int limit);

}
