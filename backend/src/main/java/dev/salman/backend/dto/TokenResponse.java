package dev.salman.backend.dto;

/** The response body of sign-in and refresh; {@code expiresIn} is the access token's lifetime in seconds. */
public record TokenResponse(String accessToken, String tokenType, long expiresIn) {

	public static TokenResponse from(IssuedTokens tokens) {
		return new TokenResponse(tokens.accessToken(), "Bearer", tokens.expiresIn());
	}

}
