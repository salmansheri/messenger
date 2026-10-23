package dev.salman.backend.service;

import java.util.List;
import java.util.UUID;

import dev.salman.backend.dto.BlockedUser;
import dev.salman.backend.entity.Conversation;

/** Blocks between Users (GLOSSARY, ADR 0006). */
public interface BlockService {

	/**
	 * The caller blocks the User. Only someone the caller shares a Direct conversation with can be blocked; anyone
	 * else, and the caller themselves, is 'User not found.'. Blocking someone already blocked changes nothing and
	 * counts against nothing; a real change counts against the hourly allowance shared with {@link #unblock}.
	 */
	void block(UUID callerId, UUID userId);

	/** Lifts the caller's Block of the User, on the same terms as {@link #block}. */
	void unblock(UUID callerId, UUID userId);

	/** The caller's Blocked Users, newest first. */
	List<BlockedUser> blockedBy(UUID callerId);

	/**
	 * Refuses (409) when the caller has blocked the other Participant of this Direct conversation: while the Block
	 * lasts they may not send there. Call it holding the Conversation's lock, which Blocks also take.
	 */
	void requireMaySend(UUID callerId, Conversation conversation);

	/** As {@link #requireMaySend}, for editing a Message or reacting to one. */
	void requireMayChange(UUID callerId, Conversation conversation);

}
