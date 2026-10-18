package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.ValidDisplayName;
import dev.salman.backend.lib.ValidEmail;
import dev.salman.backend.lib.ValidPassword;

public record SignUpRequest(
		@ValidEmail String email,
		@ValidDisplayName String displayName,
		@ValidPassword String password) {

	public SignUpRequest {
		email = Emails.normalize(email);
	}

}
