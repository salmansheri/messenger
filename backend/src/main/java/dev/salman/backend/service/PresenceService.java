package dev.salman.backend.service;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import dev.salman.backend.dto.PresenceView;

/**
 * Who is connected. A User is online while at least one of their sockets has a live entry in Redis, shared by every
 * server instance. Going online and offline are each announced exactly once to the people who share a Conversation
 * with the User. Going offline waits out a short grace period; the last-seen time is stored the moment the last socket
 * closes. The offline decision lives in Redis and is made by {@link #sweep()}, which every instance runs, so it
 * survives restarts and crashes (announcements are at least once: clients treat a repeat as no change).
 */
public interface PresenceService {

	/** A socket opened (or was found alive again): the first one announces the User as online. */
	void connected(UUID userId, String sessionId);

	/** Heartbeat: these sockets of the User are still open (also announces the User if they were not yet). */
	void refresh(UUID userId, Collection<String> sessionIds);

	/** A socket closed. When it was the last one, the User's last seen is stored and they go offline after the grace. */
	void disconnected(UUID userId, String sessionId);

	/** Declares offline every User with no live socket for longer than the grace period, announcing it. */
	void sweep();

	/**
	 * Presence of everyone else in the Conversation.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 */
	List<PresenceView> presenceOf(UUID callerId, UUID conversationId);

}
