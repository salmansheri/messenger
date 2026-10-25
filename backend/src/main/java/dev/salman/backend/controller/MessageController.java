package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.EditMessageRequest;
import dev.salman.backend.dto.MessagePage;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.SendMessageRequest;
import dev.salman.backend.lib.Principals;
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
		var sent = messages.send(Principals.userId(jwt), conversationId, request.clientMessageId(),
				request.body(), request.replyToMessageId(), request.attachmentId(), request.replyToStoryId());
		return ResponseEntity.status(sent.created() ? HttpStatus.CREATED : HttpStatus.OK).body(sent.message());
	}

	/**
	 * Page back with {@code beforeSeq}, catch up with {@code afterSeq}, open at a Message with {@code aroundSeq}; see
	 * {@link MessageService#history}.
	 */
	@GetMapping
	MessagePage history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@RequestParam(required = false) @Min(1) Long beforeSeq,
			@RequestParam(required = false) @Min(0) Long afterSeq,
			@RequestParam(required = false) @Min(1) Long aroundSeq,
			@RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit) {
		return messages.history(Principals.userId(jwt), conversationId, beforeSeq, afterSeq, aroundSeq, limit);
	}

	/** Changes the text of the caller's own Message while the edit window is open. */
	@PatchMapping("/{messageId}")
	MessageResponse edit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@PathVariable UUID messageId, @Valid @RequestBody EditMessageRequest request) {
		return messages.edit(Principals.userId(jwt), conversationId, messageId, request.body());
	}

	/** Deletes the caller's own Message for everyone while the delete window is open; repeating it is harmless. */
	@DeleteMapping("/{messageId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteForEveryone(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@PathVariable UUID messageId) {
		messages.deleteForEveryone(Principals.userId(jwt), conversationId, messageId);
	}

	/** "Delete for me": hides the Message from the caller's own view only. */
	@PostMapping("/{messageId}/hide")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void hide(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId, @PathVariable UUID messageId) {
		messages.hideForCaller(Principals.userId(jwt), conversationId, messageId);
	}

}
