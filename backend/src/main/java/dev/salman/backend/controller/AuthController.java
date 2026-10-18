package dev.salman.backend.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.EmailRequest;
import dev.salman.backend.dto.IssuedTokens;
import dev.salman.backend.dto.LoginRequest;
import dev.salman.backend.dto.LogoutRequest;
import dev.salman.backend.dto.ResetPasswordRequest;
import dev.salman.backend.dto.SignUpRequest;
import dev.salman.backend.dto.SignUpResponse;
import dev.salman.backend.dto.TokenResponse;
import dev.salman.backend.dto.VerifyEmailRequest;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.RefreshCookies;
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
	private final RefreshCookies refreshCookies;

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
	void resendVerification(@Valid @RequestBody EmailRequest request, HttpServletRequest http) {
		auth.resendVerification(request.email(), http.getRemoteAddr());
	}

	@PostMapping("/forgot-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void forgotPassword(@Valid @RequestBody EmailRequest request, HttpServletRequest http) {
		auth.requestPasswordReset(request.email(), http.getRemoteAddr());
	}

	@PostMapping("/reset-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
		auth.resetPassword(request.email(), request.code(), request.newPassword());
	}

	@PostMapping("/login")
	ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
		return session(auth.login(request.email(), request.password()));
	}

	/** The refresh token comes from the HttpOnly cookie; a failed refresh also clears the cookie. */
	@PostMapping("/refresh")
	ResponseEntity<TokenResponse> refresh(@CookieValue(name = RefreshCookies.NAME, required = false) String refreshToken) {
		try {
			if (!StringUtils.hasText(refreshToken)) {
				throw new UnauthorizedException("The refresh token is missing.");
			}
			return session(tokens.refresh(refreshToken));
		}
		catch (UnauthorizedException e) {
			e.header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString());
			throw e;
		}
	}

	@PostMapping("/logout")
	ResponseEntity<Void> logout(@CookieValue(name = RefreshCookies.NAME, required = false) String refreshToken,
			@RequestBody(required = false) LogoutRequest request) {
		if (StringUtils.hasText(refreshToken)) {
			tokens.revoke(refreshToken, request == null ? null : request.deviceId());
		}
		return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString()).build();
	}

	private ResponseEntity<TokenResponse> session(IssuedTokens issued) {
		return ResponseEntity.ok()
				.header(HttpHeaders.SET_COOKIE, refreshCookies.issue(issued.refreshToken()).toString())
				.body(TokenResponse.from(issued));
	}

}
