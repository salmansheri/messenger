package dev.salman.backend.dto;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnore;

import dev.salman.backend.lib.ValidCaption;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

/**
 * {@code replyToMessageId}, when present, is the Message of this Conversation that the new one answers.
 * {@code replyToStoryId}, when present, is a Story of the other Participant of this Direct conversation that the new
 * Message answers; a Message answers a Message or a Story, not both. {@code attachmentId}, when present, is an image
 * the sender uploaded and has not used yet; {@code body} is then its caption and may be left out. A Message needs
 * text, an image or both.
 */
public record SendMessageRequest(@NotNull UUID clientMessageId, @ValidCaption String body, UUID replyToMessageId,
		UUID attachmentId, UUID replyToStoryId) {

	@JsonIgnore
	@AssertTrue(message = "needs text or an image")
	public boolean isTextOrImage() {
		return body != null || attachmentId != null;
	}

	@JsonIgnore
	@AssertTrue(message = "cannot answer a Message and a Story at once")
	public boolean isOneReplyTarget() {
		return replyToMessageId == null || replyToStoryId == null;
	}

}
