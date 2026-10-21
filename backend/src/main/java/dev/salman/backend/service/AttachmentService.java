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
	 * Gives up the image of a Message that is being deleted for everyone: from this transaction on it cannot be sent
	 * again, and once the transaction commits its files are removed. If that fails the Message stays deleted and the
	 * periodic sweep removes the files later.
	 */
	void release(UUID attachmentId);

	/** Removes uploads nobody sent with a Message within the configured lifetime, and their stored files. */
	void removeAbandoned();

}
