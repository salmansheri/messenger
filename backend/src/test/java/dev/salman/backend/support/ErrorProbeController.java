package dev.salman.backend.support;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.service.MessageThrottle;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Test-only endpoints (on the test classpath, so never shipped) that trigger the error paths no real endpoint can
 * yet. Mounted under the public auth prefix so no token is needed; the "_probe" segment keeps them clear of real
 * routes.
 */
@RestController
@RequestMapping("/api/v1/auth/_probe")
class ErrorProbeController {

	private final MessageThrottle messageThrottle;

	ErrorProbeController(MessageThrottle messageThrottle) {
		this.messageThrottle = messageThrottle;
	}

	record ProbeBody(@NotBlank String email, @Size(min = 8) String password) {
	}

	@ResponseStatus(HttpStatus.CONFLICT)
	static class ProbeConflictException extends RuntimeException {

		ProbeConflictException() {
			super("secret conflict detail");
		}

	}

	@PostMapping("/boom")
	void boom() {
		throw new IllegalStateException("secret internal detail");
	}

	/** Counts one edit, deletion or reaction for the User, until those endpoints exist to do it for real. */
	@PostMapping("/message-change/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void messageChange(@PathVariable UUID userId) {
		messageThrottle.change(userId);
	}

	@PostMapping("/validate")
	void validate(@Valid @RequestBody ProbeBody body) {
	}

	/** Parameter-level validation handled by Spring MVC's built-in method validation. */
	@GetMapping("/page")
	void page(@RequestParam @Min(1) int page) {
	}

	@GetMapping("/conflict")
	void conflict() {
		throw new ProbeConflictException();
	}

	@GetMapping("/forbidden")
	void forbidden() {
		throw new AccessDeniedException("secret access detail");
	}

	/** Class-level @Validated switches validation to the AOP path, which raises ConstraintViolationException. */
	@RestController
	@Validated
	@RequestMapping("/api/v1/auth/_probe/validated")
	static class ValidatedProbeController {

		@GetMapping("/page")
		void page(@RequestParam @Min(1) int page) {
		}

	}

}
