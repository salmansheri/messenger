package dev.salman.backend.controller;

import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.messaging.converter.MessageConversionException;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;
import org.springframework.web.ErrorResponse;

import dev.salman.backend.dto.ReceiptRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.ReceiptService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Receipt reports sent over the socket. They go through the same service as the REST endpoint; a problem comes back
 * on the sender's own error queue as {@code {type: "error", status, title, detail, errors?}}.
 */
@Slf4j
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

	@MessageExceptionHandler
	@SendToUser(destinations = "/queue/errors", broadcast = false)
	public Map<String, Object> onError(Exception exception) {
		var error = new LinkedHashMap<String, Object>();
		error.put("type", "error");
		if (exception instanceof ErrorResponse problem) {
			error.put("status", problem.getStatusCode().value());
			error.put("title", HttpStatus.valueOf(problem.getStatusCode().value()).getReasonPhrase());
			error.put("detail", problem.getBody().getDetail());
		}
		else if (exception instanceof MethodArgumentNotValidException invalid) {
			var fields = new LinkedHashMap<String, String>();
			invalid.getBindingResult().getFieldErrors().forEach(f -> fields.merge(f.getField(),
					String.valueOf(f.getDefaultMessage()), (a, b) -> a + "; " + b));
			error.put("status", 400);
			error.put("title", "Bad Request");
			error.put("detail", "Invalid request content.");
			error.put("errors", fields);
		}
		else if (exception instanceof MessageConversionException) {
			error.put("status", 400);
			error.put("title", "Bad Request");
			error.put("detail", "The message could not be read.");
		}
		else {
			log.error("Unhandled error on a socket message", exception);
			error.put("status", 500);
			error.put("title", "Internal Server Error");
			error.put("detail", "An unexpected error occurred.");
		}
		return error;
	}

}
