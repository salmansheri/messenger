package dev.salman.backend.dto;

import dev.salman.backend.lib.ValidDisplayName;

public record UpdateProfileRequest(@ValidDisplayName String displayName) {
}
