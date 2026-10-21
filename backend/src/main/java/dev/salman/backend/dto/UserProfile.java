package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.entity.User;

public record UserProfile(UUID id, String email, String displayName, boolean emailVerified, String avatarUrl) {

	/** {@code avatarUrl} is a freshly signed link to the avatar, or null for none. */
	public static UserProfile from(User user, String avatarUrl) {
		return new UserProfile(user.getId(), user.getEmail(), user.getDisplayName(), user.isEmailVerified(), avatarUrl);
	}

}
