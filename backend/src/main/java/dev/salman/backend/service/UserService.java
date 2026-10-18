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

}
