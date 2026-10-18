package dev.salman.backend.dto;

/** Access token (short-lived JWT) plus refresh token (opaque, single use); {@code expiresIn} is in seconds. */
public record TokenResponse(String accessToken, String refreshToken, String tokenType, long expiresIn) {

	public static TokenResponse bearer(String accessToken, String refreshToken, long expiresIn) {
		return new TokenResponse(accessToken, refreshToken, "Bearer", expiresIn);
	}

}
