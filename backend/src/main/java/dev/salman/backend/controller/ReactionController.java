package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.SetReactionRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.ReactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/messages/{messageId}/reaction")
@RequiredArgsConstructor
public class ReactionController {

	private final ReactionService reactions;

	/** Puts the caller's reaction on the Message (replacing their other one); the same emoji again changes nothing. */
	@PutMapping
	MessageResponse react(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@PathVariable UUID messageId, @Valid @RequestBody SetReactionRequest request) {
		return reactions.set(Principals.userId(jwt), conversationId, messageId, request.emoji());
	}

	/** Takes the caller's reaction away; harmless when there is none. */
	@DeleteMapping
	MessageResponse unreact(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@PathVariable UUID messageId) {
		return reactions.remove(Principals.userId(jwt), conversationId, messageId);
	}

}
