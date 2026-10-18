package dev.salman.backend.dto;

import java.util.List;

/** A run of Messages in ascending Sequence order; {@code hasMore} says whether more exist in the direction paged. */
public record MessagePage(List<MessageResponse> messages, boolean hasMore) {
}
