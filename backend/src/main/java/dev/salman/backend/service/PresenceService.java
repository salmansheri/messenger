package dev.salman.backend.service;

import java.util.List;
import java.util.UUID;

import dev.salman.backend.dto.PresenceView;

/**
 * Who is connected. A User is online while at least one of their sockets has a live entry in Redis, shared by every
 * server instance. Going online and offline are each announced exactly once to the people who share a Conversation
 * with the User; going offline waits out a short grace period and records the User's last-seen time.
 */
public interface PresenceService {

	/** A socket opened (or was found alive again): the first one announces the User as online. */
	void connected(UUID userId, String sessionId);

	/** The same, as a heartbeat for a socket that is still open. */
	void refresh(UUID userId, String sessionId);

	/** A socket closed. When it was the last one, the User goes offline after the grace period unless they return. */
	void disconnected(UUID userId, String sessionId);

	/**
	 * Presence of everyone else in the Conversation.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 */
	List<PresenceView> presenceOf(UUID callerId, UUID conversationId);

}
