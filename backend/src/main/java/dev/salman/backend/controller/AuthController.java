package dev.salman.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.LoginRequest;
import dev.salman.backend.dto.RefreshRequest;
import dev.salman.backend.dto.ResendVerificationRequest;
import dev.salman.backend.dto.SignUpRequest;
import dev.salman.backend.dto.SignUpResponse;
import dev.salman.backend.dto.TokenResponse;
import dev.salman.backend.dto.VerifyEmailRequest;
import dev.salman.backend.service.AuthService;
import dev.salman.backend.service.TokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

	private final AuthService auth;
	private final TokenService tokens;

	@PostMapping("/signup")
	@ResponseStatus(HttpStatus.ACCEPTED)
	SignUpResponse signUp(@Valid @RequestBody SignUpRequest request, HttpServletRequest http) {
		return new SignUpResponse(
				auth.signUp(request.email(), request.displayName(), request.password(), http.getRemoteAddr()));
	}

	@PostMapping("/verify-email")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
		auth.verifyEmail(request.email(), request.code());
	}

	@PostMapping("/resend-verification")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void resendVerification(@Valid @RequestBody ResendVerificationRequest request, HttpServletRequest http) {
		auth.resendVerification(request.email(), http.getRemoteAddr());
	}

	@PostMapping("/login")
	TokenResponse login(@Valid @RequestBody LoginRequest request) {
		return auth.login(request.email(), request.password());
	}

	@PostMapping("/refresh")
	TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
		return tokens.refresh(request.refreshToken());
	}

	@PostMapping("/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void logout(@Valid @RequestBody RefreshRequest request) {
		tokens.revoke(request.refreshToken());
	}

}
