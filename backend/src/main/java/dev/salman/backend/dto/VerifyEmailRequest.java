package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record VerifyEmailRequest(
		@NotBlank @Email @Size(max = 320) String email,
		@Pattern(regexp = "\\d{6}", message = "must be a 6-digit code") String code) {

	public VerifyEmailRequest {
		email = Emails.normalize(email);
	}

}
