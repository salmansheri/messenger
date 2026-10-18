package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.entity.User;

public record UserProfile(UUID id, String email, String displayName, boolean emailVerified) {

	public static UserProfile from(User user) {
		return new UserProfile(user.getId(), user.getEmail(), user.getDisplayName(), user.isEmailVerified());
	}

}
