package dev.salman.backend.service.impl;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.SearchPage;
import dev.salman.backend.dto.SearchResult;
import dev.salman.backend.entity.Message;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.lib.SearchQuery;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.MessageRepository.Snippet;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.SearchService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class SearchServiceImpl implements SearchService {

	private static final Duration SEARCH_WINDOW = Duration.ofMinutes(1);

	/** The first page starts after every Message: later than any time and any id. */
	private static final Instant END_OF_TIME = Instant.parse("9999-12-31T23:59:59Z");

	private static final UUID LAST_ID = new UUID(-1L, -1L);

	/** Up to two dozen words around the first match; a short text comes back whole. */
	private static final String SNIPPET_OPTIONS = "StartSel=\"" + SearchResult.MATCH_START + "\", StopSel=\""
			+ SearchResult.MATCH_END + "\", MaxWords=24, MinWords=10, ShortWord=0, MaxFragments=1";

	private final MessageRepository messages;
	private final ParticipantRepository participants;
	private final RateLimiter rateLimiter;
	private final AppProperties props;

	@Override
	@Transactional(readOnly = true)
	public SearchPage searchConversation(UUID callerId, UUID conversationId, String query, UUID before) {
		// Every accepted call counts, found or not, like lookup: searching is the most expensive read there is (a query
		// the validation refuses never reaches here).
		rateLimiter.hit("rl:search:" + callerId, props.search().maxPerMinute(), SEARCH_WINDOW);
		var reader = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(() -> new NotFoundException("Conversation not found.")); // first, so outsiders only see a 404
		var cursor = before == null ? null : messages.findByIdAndConversationId(before, conversationId)
				.orElseThrow(() -> new BadRequestException("before must be the id of a result of this search."));

		var parsed = SearchQuery.parse(query);
		var found = messages.searchConversation(conversationId, callerId, reader.readableAfter(0), parsed.words(),
				parsed.prefix(), cursor == null ? END_OF_TIME : cursor.getCreatedAt(),
				cursor == null ? LAST_ID : cursor.getId(), PAGE_SIZE + 1); // one extra tells whether more remain
		var hasMore = found.size() > PAGE_SIZE;
		var page = hasMore ? found.subList(0, PAGE_SIZE) : found;
		return new SearchPage(results(page, parsed), hasMore);
	}

	private List<SearchResult> results(List<Message> page, SearchQuery query) {
		if (page.isEmpty()) {
			return List.of();
		}
		var snippets = messages.snippets(page.stream().map(Message::getId).toList(), query.words(), query.prefix(),
				SearchResult.MATCH_START + SearchResult.MATCH_END, SNIPPET_OPTIONS).stream()
				.collect(Collectors.toMap(Snippet::getId, Function.identity()));
		// A Message deleted between the two queries has no snippet any more, and is no longer a result.
		return page.stream()
				.filter(m -> snippets.containsKey(m.getId()) && snippets.get(m.getId()).getSnippet() != null)
				.map(m -> new SearchResult(m.getId(), m.getConversationId(), m.getSeq(), m.getSenderId(),
						m.getCreatedAt(), snippets.get(m.getId()).getSnippet()))
				.toList();
	}

}
