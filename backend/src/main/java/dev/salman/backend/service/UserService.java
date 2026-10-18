package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.UserProfile;

public interface UserService {

	/** The profile of the signed-in User; fails as unauthorized when the account no longer exists. */
	UserProfile profile(UUID userId);

}
