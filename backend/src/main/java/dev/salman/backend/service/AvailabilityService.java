package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.entity.Availability;

public interface AvailabilityService {

	/**
	 * Sets the signed-in User's Availability. The one already held changes nothing, sends nothing and does not count
	 * against the allowance; a real change does, and is announced to everyone who sees the User's presence (so not
	 * across a Block) and to their own other sessions.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the User changed it too often this hour
	 */
	UserProfile set(UUID userId, Availability availability);

}
