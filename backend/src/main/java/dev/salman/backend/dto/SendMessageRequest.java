package dev.salman.backend.dto;

import java.util.UUID;

import dev.salman.backend.lib.ValidMessageBody;
import jakarta.validation.constraints.NotNull;

public record SendMessageRequest(@NotNull UUID clientMessageId, @ValidMessageBody String body) {
}
