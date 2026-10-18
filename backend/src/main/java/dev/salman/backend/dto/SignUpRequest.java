package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.ValidEmail;
import dev.salman.backend.lib.ValidPassword;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignUpRequest(
		@ValidEmail String email,
		@NotBlank @Size(max = 100) String displayName,
		@ValidPassword String password) {

	public SignUpRequest {
		email = Emails.normalize(email);
	}

}
