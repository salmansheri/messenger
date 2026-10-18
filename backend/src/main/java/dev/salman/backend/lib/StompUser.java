package dev.salman.backend.lib;

import java.security.Principal;

/** The signed-in User of a STOMP session; the name is the User id, which is how events are addressed to them. */
public record StompUser(String userId) implements Principal {

	@Override
	public String getName() {
		return userId;
	}

}
