package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.MessagePage;
import dev.salman.backend.dto.MessageResponse;
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

	/**
	 * Changes the text of the caller's own Message, within the edit window. Its position, Sequence number and status
	 * stay as they were, and nothing is counted as unread or pushed; the Participants hear {@code message.updated}.
	 * Sending the text it already has changes nothing.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant, or the Message is
	 *         not in this Conversation or from before the caller joined
	 * @throws dev.salman.backend.exception.ForbiddenException when the Message is someone else's
	 * @throws dev.salman.backend.exception.ConflictException when the edit window has passed, or the Message was
	 *         deleted
	 */
	MessageResponse edit(UUID callerId, UUID conversationId, UUID messageId, String body);

	/**
	 * Deletes the caller's own Message for everyone, within the delete window. It stays as a placeholder in its
	 * place with its text gone. Deleting one that is already deleted does nothing.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant, or the Message is
	 *         not in this Conversation or from before the caller joined
	 * @throws dev.salman.backend.exception.ForbiddenException when the Message is someone else's
	 * @throws dev.salman.backend.exception.ConflictException when the delete window has passed
	 */
	void deleteForEveryone(UUID callerId, UUID conversationId, UUID messageId);

	/**
	 * Hides a Message from the caller's own view ("delete for me"): it no longer appears in their history, paging,
	 * catch-up or Conversation list, and nobody else can tell. Any Participant may hide any Message they can read, at
	 * any time, and hiding it again does nothing. Unread counts are unchanged (they are plain Sequence arithmetic).
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant, or the Message is
	 *         not in this Conversation or from before the caller joined
	 */
	void hideForCaller(UUID callerId, UUID conversationId, UUID messageId);

}
