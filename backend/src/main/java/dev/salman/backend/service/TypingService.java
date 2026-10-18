package dev.salman.backend.service;

import java.util.UUID;

/** Typing indicators: passed on live to the other Participants and never stored. */
public interface TypingService {

	/**
	 * Tells the other current Participants that the caller started or stopped typing. Starts are limited (10 per 10
	 * seconds per Conversation) and the excess is dropped without error; stops are never dropped.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 */
	void typing(UUID callerId, UUID conversationId, boolean typing);

}
