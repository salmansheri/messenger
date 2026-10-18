package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.ValidEmail;
import dev.salman.backend.lib.ValidPassword;
import dev.salman.backend.lib.ValidVerificationCode;

public record ResetPasswordRequest(
		@ValidEmail String email,
		@ValidVerificationCode String code,
		@ValidPassword String newPassword) {

	public ResetPasswordRequest {
		email = Emails.normalize(email);
	}

}
