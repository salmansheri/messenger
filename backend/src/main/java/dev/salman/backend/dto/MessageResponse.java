package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

import dev.salman.backend.entity.Message;

public record MessageResponse(UUID id, UUID conversationId, long seq, UUID senderId, UUID clientMessageId,
		String body, Instant createdAt) {

	public static MessageResponse from(Message message) {
		return new MessageResponse(message.getId(), message.getConversationId(), message.getSeq(),
				message.getSenderId(), message.getClientMessageId(), message.getBody(), message.getCreatedAt());
	}

}
