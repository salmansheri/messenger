package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

/** Someone the caller has blocked, as their Blocked Users list shows them. {@code avatarUrl} is null for none. */
public record BlockedUser(UUID userId, String displayName, String avatarUrl, Instant blockedAt) {
}
