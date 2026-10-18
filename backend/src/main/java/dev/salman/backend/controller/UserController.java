package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.service.UserService;
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

}
