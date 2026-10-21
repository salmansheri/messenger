package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.SearchPage;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.lib.ValidSearchQuery;
import dev.salman.backend.service.SearchService;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class SearchController {

	private final SearchService search;

	/**
	 * Messages of one Conversation matching {@code q}, newest first; pass the last result's {@code messageId} as
	 * {@code before} for the next page. See {@link SearchService#searchConversation}.
	 */
	@GetMapping("/api/v1/conversations/{conversationId}/messages/search")
	SearchPage searchConversation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@RequestParam @ValidSearchQuery String q, @RequestParam(required = false) UUID before) {
		return search.searchConversation(Principals.userId(jwt), conversationId, q, before);
	}

	/**
	 * Messages of every Conversation the caller is in matching {@code q}, newest first, each saying its Conversation.
	 * See {@link SearchService#searchAll}.
	 */
	@GetMapping("/api/v1/messages/search")
	SearchPage searchAll(@AuthenticationPrincipal Jwt jwt, @RequestParam @ValidSearchQuery String q,
			@RequestParam(required = false) UUID before) {
		return search.searchAll(Principals.userId(jwt), q, before);
	}

}
