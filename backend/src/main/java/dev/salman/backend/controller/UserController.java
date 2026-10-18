package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.dto.UserSummary;
import dev.salman.backend.service.UserService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

	private final UserService users;

	@GetMapping("/me")
	UserProfile me(@AuthenticationPrincipal Jwt jwt) {
		return users.profile(UUID.fromString(jwt.getSubject()));
	}

	/** Exact email only: this is how a User finds someone to talk to, not a way to browse the user base. */
	@GetMapping("/lookup")
	UserSummary lookup(@RequestParam @NotBlank @Size(max = 320) String email) {
		return users.findVerifiedByEmail(email);
	}

}
