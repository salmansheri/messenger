package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

import dev.salman.backend.entity.Availability;

/**
 * Whether a User is connected right now; {@code lastSeenAt} is only given while they are offline. {@code availability}
 * is how they say they can be reached, given online or not.
 */
public record PresenceView(UUID userId, boolean online, Instant lastSeenAt, Availability availability) {
}
