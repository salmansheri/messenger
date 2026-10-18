package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(@NotBlank @Email @Size(max = 320) String email) {

	public ForgotPasswordRequest {
		email = Emails.normalize(email);
	}

}
