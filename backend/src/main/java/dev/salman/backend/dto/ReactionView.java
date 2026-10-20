package dev.salman.backend.dto;

import java.util.List;
import java.util.UUID;

/** Everyone who reacted to a Message with one emoji, in the order they did. */
public record ReactionView(String emoji, List<UUID> userIds) {
}
