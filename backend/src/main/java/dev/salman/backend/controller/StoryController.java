package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.PostStoryRequest;
import dev.salman.backend.dto.StoryResponse;
import dev.salman.backend.dto.StoryTray;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.StoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/stories")
@RequiredArgsConstructor
public class StoryController {

	private final StoryService stories;

	/** Posts a text Story; see {@link StoryService#post}. */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	StoryResponse post(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PostStoryRequest request) {
		return stories.post(Principals.userId(jwt), request);
	}

	/** The caller's Stories tray; see {@link StoryService#tray}. */
	@GetMapping
	StoryTray tray(@AuthenticationPrincipal Jwt jwt) {
		return stories.tray(Principals.userId(jwt));
	}

	/** Deletes one of the caller's own Stories; 204 also when it was already deleted. */
	@DeleteMapping("/{storyId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID storyId) {
		stories.delete(Principals.userId(jwt), storyId);
	}

}
