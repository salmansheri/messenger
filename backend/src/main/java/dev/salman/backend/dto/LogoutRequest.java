package dev.salman.backend.dto;

import java.util.UUID;

/** Optional body of a logout: the device (from registering it) to stop sending push notifications to. */
public record LogoutRequest(UUID deviceId) {
}
