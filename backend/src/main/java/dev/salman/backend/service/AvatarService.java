package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.UserProfile;

/** A User's avatar: one square picture shown to the people who share a Conversation with them. */
public interface AvatarService {

	/**
	 * Replaces the User's avatar with the centre square of the picture, scaled to 256 pixels and cleaned of metadata.
	 * The previous picture's file is removed, and everyone who shares a Conversation with them (and their own other
	 * sessions) is told.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the User changed their avatar too often this hour
	 * @throws dev.salman.backend.exception.BadRequestException when the file is empty, not an allowed image or too large
	 *         in pixels
	 * @throws dev.salman.backend.exception.PayloadTooLargeException when it is over 10 MB
	 */
	UserProfile set(UUID userId, byte[] picture);

	/** Removes the avatar and its file; a User with none is left as they are, and nobody is told. */
	void remove(UUID userId);

}
