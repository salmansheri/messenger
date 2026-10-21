package dev.salman.backend.dto;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnore;

import dev.salman.backend.lib.ValidCaption;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

/**
 * {@code replyToMessageId}, when present, is the Message of this Conversation that the new one answers.
 * {@code attachmentId}, when present, is an image the sender uploaded and has not used yet; {@code body} is then its
 * caption and may be left out. A Message needs text, an image or both.
 */
public record SendMessageRequest(@NotNull UUID clientMessageId, @ValidCaption String body, UUID replyToMessageId,
		UUID attachmentId) {

	@JsonIgnore
	@AssertTrue(message = "needs text or an image")
	public boolean isTextOrImage() {
		return body != null || attachmentId != null;
	}

}
