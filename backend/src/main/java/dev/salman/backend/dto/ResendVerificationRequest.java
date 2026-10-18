package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResendVerificationRequest(@NotBlank @Email @Size(max = 320) String email) {

	public ResendVerificationRequest {
		email = Emails.normalize(email);
	}

}
