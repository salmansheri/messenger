package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.dto.UserSummary;

public interface UserService {

	/** The profile of the signed-in User; fails as unauthorized when the User no longer exists. */
	UserProfile profile(UUID userId);

	/**
	 * Finds a verified User by exact email (ignoring case and surrounding spaces). Each call counts against the
	 * caller's per-minute lookup allowance, found or not.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the caller has used their allowance
	 * @throws dev.salman.backend.exception.NotFoundException for any email that is not an exact match of a verified
	 *         User; unknown and unverified emails are indistinguishable
	 */
	UserSummary findVerifiedByEmail(UUID callerId, String email);

	/**
	 * Changes the signed-in User's display name (surrounding spaces are dropped). The same name changes nothing, sends
	 * nothing and does not count against the allowance; a real change does, and is announced to everyone who shares a
	 * Conversation with them and to their own other sessions.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the User changed their name too often this hour
	 */
	UserProfile updateDisplayName(UUID userId, String displayName);

}
