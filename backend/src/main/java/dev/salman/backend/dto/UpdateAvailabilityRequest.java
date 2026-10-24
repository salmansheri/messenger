package dev.salman.backend.dto;

import dev.salman.backend.entity.Availability;
import jakarta.validation.constraints.NotNull;

public record UpdateAvailabilityRequest(@NotNull Availability availability) {
}
