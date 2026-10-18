package dev.salman.backend.controller;

import java.security.Principal;
import java.util.UUID;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import dev.salman.backend.dto.ReceiptRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.ReceiptService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Receipt reports sent over the socket. They go through the same service as the REST endpoint; a problem comes back
 * on the sender's own error queue (see {@link SocketErrors}).
 */
@Controller
@RequiredArgsConstructor
public class SocketReceiptController {

	private final ReceiptService receipts;

	@MessageMapping("/conversations/{conversationId}/receipts")
	public void report(Principal principal, @DestinationVariable UUID conversationId,
			@Valid @Payload ReceiptRequest request) {
		receipts.report(Principals.userId(principal), conversationId, request.deliveredSeq(),
				request.readSeq());
	}

}
