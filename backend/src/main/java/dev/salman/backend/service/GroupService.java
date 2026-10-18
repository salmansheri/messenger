package dev.salman.backend.service;

import java.util.Collection;
import java.util.UUID;

import dev.salman.backend.dto.ConversationResponse;

/**
 * Groups: Conversations with a name, Admins and Participants who come and go. Every change takes the Conversation
 * lock, so it runs one at a time with sends and with other changes, and membership is checked again under it.
 * A non-Participant, or an unknown Conversation, always gets {@code NotFoundException}; a Participant who is not an
 * Admin gets {@code ForbiddenException} on Admin-only changes; anything on a Direct conversation is a
 * {@code BadRequestException}.
 */
public interface GroupService {

	/** Creates a Group with the caller as Admin and the other verified Users as members. */
	ConversationResponse create(UUID callerId, String name, Collection<UUID> userIds);

	ConversationResponse rename(UUID callerId, UUID conversationId, String name);

	/** Adds a verified User as a member; they can only read Messages sent after this point. Fails when full. */
	ConversationResponse addParticipant(UUID callerId, UUID conversationId, UUID userId);

	/** Removes another Participant; the caller uses {@link #leave} for themselves. */
	void removeParticipant(UUID callerId, UUID conversationId, UUID userId);

	/** Makes a Participant an Admin; promoting an Admin changes nothing. */
	void promote(UUID callerId, UUID conversationId, UUID userId);

	/**
	 * Leaves the Group. When the last Admin leaves, the longest-standing remaining Participant becomes Admin; when
	 * the last Participant leaves, the Group and its Messages are deleted.
	 */
	void leave(UUID callerId, UUID conversationId);

}
