package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.MessageResponse;

/**
 * A Participant's reaction to a Message: one of six emoji, at most one per Participant per Message. Reacting never
 * changes unread counts, receipts, push or the order of the list; the other Participants hear {@code reaction.changed}.
 * Both calls are idempotent, so a retry cannot flip the state; clients decide that choosing the same emoji again means
 * taking it away.
 */
public interface ReactionService {

	/**
	 * Puts the caller's reaction on the Message, replacing any other they had there, and returns the Message as the
	 * caller sees it. Choosing the same emoji again changes nothing.
	 *
	 * @throws dev.salman.backend.exception.BadRequestException when {@code emoji} is not one of the six
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant, or the Message is
	 *         not in this Conversation, is from before the caller joined or was hidden by them
	 * @throws dev.salman.backend.exception.ConflictException when the Message was deleted for everyone
	 */
	MessageResponse set(UUID callerId, UUID conversationId, UUID messageId, String emoji);

	/** Takes the caller's reaction away (nothing happens if there is none); the same errors apply as for {@link #set}. */
	MessageResponse remove(UUID callerId, UUID conversationId, UUID messageId);

}
