package dev.salman.backend.dto;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One thing to push to some Users' sockets. It is what travels over RabbitMQ between server instances: every
 * instance receives it and delivers the {@code payload} to the {@code recipients} that are connected to it.
 */
public record RealtimeEvent(Set<UUID> recipients, Map<String, Object> payload) {
}
