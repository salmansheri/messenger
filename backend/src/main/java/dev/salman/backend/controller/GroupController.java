package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.AddParticipantRequest;
import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.CreateGroupRequest;
import dev.salman.backend.dto.RenameGroupRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.GroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class GroupController {

	private final GroupService groups;

	@PostMapping("/groups")
	@ResponseStatus(HttpStatus.CREATED)
	ConversationResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateGroupRequest request) {
		return groups.create(Principals.userId(jwt), request.name(), request.userIds());
	}

	@PatchMapping("/{conversationId}")
	ConversationResponse rename(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@Valid @RequestBody RenameGroupRequest request) {
		return groups.rename(Principals.userId(jwt), conversationId, request.name());
	}

	@PostMapping("/{conversationId}/participants")
	ConversationResponse addParticipant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@Valid @RequestBody AddParticipantRequest request) {
		return groups.addParticipant(Principals.userId(jwt), conversationId, request.userId());
	}

	@DeleteMapping("/{conversationId}/participants/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeParticipant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@PathVariable UUID userId) {
		groups.removeParticipant(Principals.userId(jwt), conversationId, userId);
	}

	@PostMapping("/{conversationId}/participants/{userId}/promote")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void promote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId, @PathVariable UUID userId) {
		groups.promote(Principals.userId(jwt), conversationId, userId);
	}

	@PostMapping("/{conversationId}/leave")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void leave(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId) {
		groups.leave(Principals.userId(jwt), conversationId);
	}

}
