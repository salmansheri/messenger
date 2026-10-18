package dev.salman.backend.service;

import dev.salman.backend.dto.IssuedTokens;
import dev.salman.backend.entity.User;

public interface TokenService {

	/** Starts a new session for the User: a short-lived access token and the first refresh token of a new family. */
	IssuedTokens startSession(User user);

	/**
	 * Exchanges a refresh token for a new pair in the same session. Each refresh token works once: presenting a used
	 * one revokes the whole session.
	 *
	 * @throws dev.salman.backend.exception.UnauthorizedException when the token is unknown, expired or already used
	 */
	IssuedTokens refresh(String refreshToken);

	/** Ends the session the refresh token belongs to; unknown tokens are ignored. */
	void revoke(String refreshToken);

}
