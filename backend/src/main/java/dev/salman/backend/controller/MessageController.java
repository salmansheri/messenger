package dev.salman.backend.controller;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.MessagePage;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.SendMessageRequest;
import dev.salman.backend.service.MessageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/messages")
@RequiredArgsConstructor
public class MessageController {

	private final MessageService messages;

	/** 201 when stored, 200 when the Client message ID had already been stored (a retry). */
	@PostMapping
	ResponseEntity<MessageResponse> send(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@Valid @RequestBody SendMessageRequest request) {
		var sent = messages.send(UUID.fromString(jwt.getSubject()), conversationId, request.clientMessageId(),
				request.body());
		return ResponseEntity.status(sent.created() ? HttpStatus.CREATED : HttpStatus.OK).body(sent.message());
	}

	/** Page back with {@code beforeSeq}, catch up with {@code afterSeq}; see {@link MessageService#history}. */
	@GetMapping
	MessagePage history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@RequestParam(required = false) @Min(1) Long beforeSeq,
			@RequestParam(required = false) @Min(0) Long afterSeq,
			@RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit) {
		return messages.history(UUID.fromString(jwt.getSubject()), conversationId, beforeSeq, afterSeq, limit);
	}

}
