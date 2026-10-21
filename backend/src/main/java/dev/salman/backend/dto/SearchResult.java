package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One Message found by Search, light enough for a list: where and when it was said, and a snippet of its text with
 * each matched word between {@link #MATCH_START} and {@link #MATCH_END} (two private-use characters, taken out of the
 * text first so nobody can fake a mark by typing them). Open it with the history's {@code aroundSeq}.
 */
public record SearchResult(UUID messageId, UUID conversationId, long seq, UUID senderId, Instant createdAt,
		String snippet) {

	public static final String MATCH_START = "";

	public static final String MATCH_END = "";

}
