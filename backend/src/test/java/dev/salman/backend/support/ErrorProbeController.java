package dev.salman.backend.support;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Test-only endpoints (on the test classpath, so never shipped) that trigger the error paths no real endpoint can
 * yet: an unexpected failure and a validation failure. Mounted under the public auth prefix so no token is needed.
 */
@RestController
@RequestMapping("/api/v1/auth/_probe")
class ErrorProbeController {

	record Signup(@NotBlank String email, @Size(min = 8) String password) {
	}

	@PostMapping("/boom")
	void boom() {
		throw new IllegalStateException("secret internal detail");
	}

	@PostMapping("/validate")
	void validate(@Valid @RequestBody Signup body) {
	}

}
