package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.UpdateSettingsRequest;

/** The caller's private mute, archive and pin settings for a Conversation. */
public interface ConversationSettingsService {

	/**
	 * Changes the settings that are present in the request and returns the Conversation as the caller sees it.
	 * Archiving a pinned Conversation unpins it; asking for both at once is refused. Their owner's other open
	 * sessions are told ({@code settings.changed}) when something actually changed.
	 *
	 * @throws dev.salman.backend.exception.BadRequestException when nothing is asked for, or archive and pin are both
	 *         asked to become true
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 * @throws dev.salman.backend.exception.ConflictException when pinning an archived Conversation, or a fourth pin
	 */
	ConversationResponse update(UUID callerId, UUID conversationId, UpdateSettingsRequest request);

}
