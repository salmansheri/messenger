package dev.salman.backend.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** {@code userIds} are the other Participants (at most 255, since the creator makes 256); duplicates are ignored. */
public record CreateGroupRequest(
		@NotBlank @Size(max = 100) String name,
		@NotEmpty @Size(max = 255) List<@NotNull UUID> userIds) {
}
