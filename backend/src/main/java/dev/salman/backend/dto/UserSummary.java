package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.entity.User;

/** What other Users may see of a User: enough to start a conversation, nothing more. */
public record UserSummary(UUID id, String displayName) {

	public static UserSummary from(User user) {
		return new UserSummary(user.getId(), user.getDisplayName());
	}

}
