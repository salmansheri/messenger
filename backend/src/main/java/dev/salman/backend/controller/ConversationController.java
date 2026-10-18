package dev.salman.backend.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.StartDirectConversationRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.ConversationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {

	private final ConversationService conversations;

	/** 201 when the Direct conversation was created, 200 when it already existed. */
	@PostMapping("/direct")
	ResponseEntity<ConversationResponse> startDirect(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody StartDirectConversationRequest request) {
		var started = conversations.startDirect(Principals.userId(jwt), request.userId());
		return ResponseEntity.status(started.created() ? HttpStatus.CREATED : HttpStatus.OK)
				.body(started.conversation());
	}

	@GetMapping
	List<ConversationResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return conversations.listFor(Principals.userId(jwt));
	}

	@GetMapping("/{conversationId}")
	ConversationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId) {
		return conversations.get(Principals.userId(jwt), conversationId);
	}

}
