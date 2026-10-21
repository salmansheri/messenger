package dev.salman.backend.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * A run of Messages in ascending Sequence order; {@code hasMore} says whether more exist in the direction paged. A
 * window opened around a Message ({@code aroundSeq}) reaches both ways, so it also says which ends have more:
 * {@code hasOlder} and {@code hasNewer} (left out of every other page, which only knows its own direction); its
 * {@code hasMore} is {@code hasOlder}, the direction it means on the newest page.
 */
public record MessagePage(List<MessageResponse> messages, boolean hasMore,
		@JsonInclude(JsonInclude.Include.NON_NULL) Boolean hasOlder,
		@JsonInclude(JsonInclude.Include.NON_NULL) Boolean hasNewer) {

	public MessagePage(List<MessageResponse> messages, boolean hasMore) {
		this(messages, hasMore, null, null);
	}

}
