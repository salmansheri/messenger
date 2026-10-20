package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.lib.ValidMessageBody;
import jakarta.validation.constraints.NotNull;

/** {@code replyToMessageId}, when present, is the Message of this Conversation that the new one answers. */
public record SendMessageRequest(@NotNull UUID clientMessageId, @ValidMessageBody String body, UUID replyToMessageId) {
}
