package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

/** Whether a User is connected right now; {@code lastSeenAt} is only given while they are offline. */
public record PresenceView(UUID userId, boolean online, Instant lastSeenAt) {
}
