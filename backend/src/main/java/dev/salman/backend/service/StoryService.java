package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.PostStoryRequest;
import dev.salman.backend.dto.StoryResponse;
import dev.salman.backend.dto.StoryTray;

/**
 * Stories (GLOSSARY "Story"). A Story is seen by its poster's audience: everyone they share a Direct conversation
 * with, less anyone either of them has blocked. It is served for 24 hours, then never again.
 */
public interface StoryService {

	/**
	 * Posts a text Story, live for 24 hours from now, and announces it to the poster's sessions and their audience.
	 *
	 * @throws dev.salman.backend.exception.ConflictException when the poster already has the most live Stories allowed
	 * @throws dev.salman.backend.exception.RateLimitedException when they posted too often this hour
	 */
	StoryResponse post(UUID posterId, PostStoryRequest request);

	/** The caller's tray: their own live Stories and those of everyone whose audience they are in. */
	StoryTray tray(UUID callerId);

	/**
	 * Deletes one of the caller's own Stories, at once for everyone; deleting it again changes nothing.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException for anyone else's Story, an expired one or an unknown id
	 */
	void delete(UUID callerId, UUID storyId);

}
