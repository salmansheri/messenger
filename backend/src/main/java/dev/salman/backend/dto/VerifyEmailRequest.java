package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.ValidEmail;
import dev.salman.backend.lib.ValidVerificationCode;

public record VerifyEmailRequest(@ValidEmail String email, @ValidVerificationCode String code) {

	public VerifyEmailRequest {
		email = Emails.normalize(email);
	}

}
