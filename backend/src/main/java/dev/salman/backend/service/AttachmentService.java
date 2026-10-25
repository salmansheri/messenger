package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.AttachmentResponse;

/** Images uploaded ahead of the Message they are sent with. */
public interface AttachmentService {

	/**
	 * Validates, cleans and stores an image for {@code ownerId}, which only they can attach to a Message.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when the User uploads too often
	 * @throws dev.salman.backend.exception.BadRequestException when it is empty, not an allowed image or too large in
	 *         pixels
	 * @throws dev.salman.backend.exception.PayloadTooLargeException when it is over 10 MB
	 */
	AttachmentResponse upload(UUID ownerId, byte[] bytes);

	/**
	 * Claims an upload for the Message or Story being created in the caller's transaction: locks it until that commits,
	 * so two cannot both claim it, and answers it with freshly signed links.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException when it is someone else's, unknown, released or already
	 *         used by a Message or a Story (all alike)
	 */
	AttachmentResponse claim(UUID ownerId, UUID attachmentId);

	/**
	 * Gives up the image of a Message that is being deleted for everyone, or of a photo Story being deleted: from this
	 * transaction on it cannot be used again, and once the transaction commits its files are removed. If that fails the
	 * Message or Story stays deleted and the periodic sweep removes the files later.
	 */
	void release(UUID attachmentId);

	/** Removes uploads no Message or Story used within the configured lifetime, and their stored files. */
	void removeAbandoned();

}
