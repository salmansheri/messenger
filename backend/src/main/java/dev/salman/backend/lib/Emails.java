package dev.salman.backend.lib;

import java.util.Locale;

public final class Emails {

	private Emails() {
	}

	/** Email addresses are matched ignoring case and surrounding whitespace. */
	public static String normalize(String email) {
		return email == null ? null : email.strip().toLowerCase(Locale.ROOT);
	}

}
