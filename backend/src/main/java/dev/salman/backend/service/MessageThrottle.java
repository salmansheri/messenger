package dev.salman.backend.service;

import java.util.UUID;

/** Per-User limits on writing Messages, so one client (or a stuck key) cannot flood the system. */
public interface MessageThrottle {

	/**
	 * Counts one new Message sent by {@code userId}. Call it only for a Message that is actually about to be stored,
	 * so a retry the server already answered is never counted.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the User has sent too many this minute
	 */
	void send(UUID userId);

	/**
	 * Counts one edit, deletion or reaction by {@code userId}.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the User has made too many changes this minute
	 */
	void change(UUID userId);

}
