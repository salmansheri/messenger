package dev.salman.backend.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(@NotNull UUID clientMessageId, @NotBlank @Size(max = 4000) String body) {
}
