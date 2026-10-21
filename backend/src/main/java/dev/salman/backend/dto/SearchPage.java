package dev.salman.backend.dto;

import java.util.List;

/**
 * Search results, newest first; {@code hasMore} says older ones remain, asked for by passing the last result's
 * {@code messageId} as {@code before}.
 */
public record SearchPage(List<SearchResult> results, boolean hasMore) {
}
