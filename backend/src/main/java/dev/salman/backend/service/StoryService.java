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
	 * Posts a text or photo Story, live for 24 hours from now, and announces it to the poster's sessions and their
	 * audience. A photo Story takes an upload of the poster's that no Message or other Story uses.
	 *
	 * @throws dev.salman.backend.exception.ConflictException when the poster already has the most live Stories allowed
	 * @throws dev.salman.backend.exception.RateLimitedException when they posted too often this hour
	 * @throws dev.salman.backend.exception.NotFoundException when the upload is someone else's, unknown or already used
	 */
	StoryResponse post(UUID posterId, PostStoryRequest request);

	/** The caller's tray: their own live Stories and those of everyone whose audience they are in. */
	StoryTray tray(UUID callerId);

	/**
	 * Deletes one of the caller's own Stories, at once for everyone; deleting it again changes nothing. A photo Story's
	 * upload is released: its files go once this commits, or later through the sweep if storage fails.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException for anyone else's Story, an expired one or an unknown id
	 */
	void delete(UUID callerId, UUID storyId);

	/**
	 * Removes a bounded batch of expired Stories with their Story views, releases their photos as a delete does, and
	 * announces each one that had not been deleted already. Safe to run on several instances at once.
	 */
	void removeExpired();

	/**
	 * Checks that {@code replierId} may answer the Story with a Message to {@code posterId}: the Story is theirs, live,
	 * and seen by the replier. The Story stays locked until the caller's transaction ends, so it cannot be deleted
	 * half-way through the reply.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException otherwise ('Story not found.')
	 */
	void requireRepliable(UUID replierId, UUID posterId, UUID storyId);

}
