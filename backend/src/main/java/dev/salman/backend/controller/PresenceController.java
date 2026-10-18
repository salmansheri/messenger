package dev.salman.backend.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.PresenceView;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.PresenceService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/presence")
@RequiredArgsConstructor
public class PresenceController {

	private final PresenceService presence;

	/** Who else in this Conversation is online, and when the others were last seen. Participants only. */
	@GetMapping
	List<PresenceView> presence(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId) {
		return presence.presenceOf(Principals.userId(jwt), conversationId);
	}

}
