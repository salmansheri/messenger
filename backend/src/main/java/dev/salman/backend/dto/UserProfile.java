package dev.salman.backend.dto;

import java.util.UUID;

public record UserProfile(UUID id, String email, String displayName, boolean emailVerified) {
}
