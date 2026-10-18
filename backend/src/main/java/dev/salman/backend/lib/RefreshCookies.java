package dev.salman.backend.lib;

import java.time.Duration;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.AppProperties;
import lombok.RequiredArgsConstructor;

/**
 * The refresh token lives only in this cookie: unreadable by scripts (HttpOnly), never sent cross-site
 * (SameSite=Strict) and only to the auth endpoints that need it.
 */
@Component
@RequiredArgsConstructor
public class RefreshCookies {

	public static final String NAME = "refresh_token";

	private static final String PATH = "/api/v1/auth";

	private final AppProperties props;

	public ResponseCookie issue(String refreshToken) {
		return builder(refreshToken).maxAge(props.jwt().refreshTokenTtl()).build();
	}

	public ResponseCookie clear() {
		return builder("").maxAge(Duration.ZERO).build();
	}

	private ResponseCookie.ResponseCookieBuilder builder(String value) {
		return ResponseCookie.from(NAME, value)
				.httpOnly(true)
				.secure(props.refreshCookie().secure())
				.sameSite("Strict")
				.path(PATH);
	}

}
