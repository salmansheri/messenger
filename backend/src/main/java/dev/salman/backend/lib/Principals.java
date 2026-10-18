package dev.salman.backend.lib;

import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

public final class Principals {

	private Principals() {
	}

	/** The id of the signed-in User: the subject of their access token. */
	public static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

}
