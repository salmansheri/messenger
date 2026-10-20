package dev.salman.backend.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.salman.backend.entity.Message;

/**
 * {@code status} is only set when the viewer sent the Message; it is null on everyone else's. {@code editedAt} is
 * set once the sender has changed the text. A Message deleted for everyone has no {@code body} and a
 * {@code deletedAt}; it keeps its place and Sequence number. {@code replyTo} is what a reply shows of the Message it
 * answers, as the viewer sees it (null for a Message that answers nothing, and for one that was deleted).
 * {@code reactions} lists who reacted with what (empty for none, and for a Message that was deleted).
 */
public record MessageResponse(UUID id, UUID conversationId, long seq, UUID senderId, UUID clientMessageId,
		String body, Instant createdAt, Instant editedAt, Instant deletedAt, MessageStatus status, ReplyQuote replyTo,
		List<ReactionView> reactions) {

	public static MessageResponse from(Message message, MessageStatus status) {
		return from(message, status, null);
	}

	public static MessageResponse from(Message message, MessageStatus status, ReplyQuote replyTo) {
		return from(message, status, replyTo, List.of());
	}

	public static MessageResponse from(Message message, MessageStatus status, ReplyQuote replyTo,
			List<ReactionView> reactions) {
		return new MessageResponse(message.getId(), message.getConversationId(), message.getSeq(),
				message.getSenderId(), message.getClientMessageId(), message.getBody(), message.getCreatedAt(), message.getEditedAt(),
				message.getDeletedAt(), status, replyTo, reactions);
	}

}
