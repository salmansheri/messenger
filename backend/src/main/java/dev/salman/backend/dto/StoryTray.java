package dev.salman.backend.dto;

import java.util.List;
import java.util.UUID;

/**
 * What the Stories tray shows: the caller's own live Stories, then everyone in their audience who has live Stories,
 * the one who posted most recently first. Each list of Stories is oldest first. {@code avatarUrl} is null for none.
 */
public record StoryTray(List<StoryResponse> own, List<Person> people) {

	public record Person(UUID userId, String displayName, String avatarUrl, List<StoryResponse> stories) {
	}

}
