package dev.salman.backend.controller;

import java.security.Principal;
import java.util.UUID;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import dev.salman.backend.dto.TypingRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.TypingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/** Typing notices sent over the socket; problems come back on the sender's error queue (see {@link SocketErrors}). */
@Controller
@RequiredArgsConstructor
public class SocketTypingController {

	private final TypingService typing;

	@MessageMapping("/conversations/{conversationId}/typing")
	public void typing(Principal principal, @DestinationVariable UUID conversationId,
			@Valid @Payload TypingRequest request) {
		typing.typing(Principals.userId(principal), conversationId, request.typing());
	}

}
