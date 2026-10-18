package dev.salman.backend.dto;

import dev.salman.backend.entity.DevicePlatform;
import dev.salman.backend.lib.ValidDeviceToken;
import jakarta.validation.constraints.NotNull;

public record RegisterDeviceRequest(@ValidDeviceToken String token, @NotNull DevicePlatform platform) {
}
