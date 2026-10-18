package dev.salman.backend.service;

import java.util.List;
import java.util.UUID;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.StartedConversation;

public interface ConversationService {

	/**
	 * Starts a Direct conversation between the caller and another User, or returns the one that already exists.
	 * The result is the same whichever of the two starts it, and concurrent attempts create exactly one.
	 *
	 * @throws dev.salman.backend.exception.BadRequestException when the caller names themselves
	 * @throws dev.salman.backend.exception.NotFoundException when the other User does not exist or is not verified
	 */
	StartedConversation startDirect(UUID callerId, UUID otherUserId);

	/** The caller's Conversations, most recently active first; never anyone else's. */
	List<ConversationResponse> listFor(UUID callerId);

	/**
	 * One of the caller's Conversations.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant (or it does not
	 *         exist: the two look the same)
	 */
	ConversationResponse get(UUID callerId, UUID conversationId);

}
