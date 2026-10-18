package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.ValidEmail;

/** A request that is only about an email address (resend a code, start a password reset). */
public record EmailRequest(@ValidEmail String email) {

	public EmailRequest {
		email = Emails.normalize(email);
	}

}
