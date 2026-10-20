package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

import dev.salman.backend.entity.Message;

/**
 * {@code status} is only set when the viewer sent the Message; it is null on everyone else's. {@code editedAt} is
 * set once the sender has changed the text. A Message deleted for everyone has no {@code body} and a
 * {@code deletedAt}; it keeps its place and Sequence number.
 */
public record MessageResponse(UUID id, UUID conversationId, long seq, UUID senderId, UUID clientMessageId,
		String body, Instant createdAt, Instant editedAt, Instant deletedAt, MessageStatus status) {

	public static MessageResponse from(Message message, MessageStatus status) {
		return new MessageResponse(message.getId(), message.getConversationId(), message.getSeq(),
				message.getSenderId(), message.getClientMessageId(), message.getBody(), message.getCreatedAt(), message.getEditedAt(),
				message.getDeletedAt(), status);
	}

}
