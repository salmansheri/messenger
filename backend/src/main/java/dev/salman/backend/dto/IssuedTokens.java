package dev.salman.backend.dto;

/** What a new session consists of; the refresh token is delivered by cookie, never in a response body. */
public record IssuedTokens(String accessToken, String refreshToken, long expiresIn) {
}
