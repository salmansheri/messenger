package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.ReceiptRequest;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.ReceiptService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/receipts")
@RequiredArgsConstructor
public class ReceiptController {

	private final ReceiptService receipts;

	@PostMapping
	ReceiptResponse report(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID conversationId,
			@Valid @RequestBody ReceiptRequest request) {
		return receipts.report(Principals.userId(jwt), conversationId, request.deliveredSeq(), request.readSeq());
	}

}
