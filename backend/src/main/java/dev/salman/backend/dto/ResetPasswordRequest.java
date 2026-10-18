package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.MaxUtf8Bytes;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
		@NotBlank @Email @Size(max = 320) String email,
		@Pattern(regexp = "\\d{6}", message = "must be a 6-digit code") String code,
		@NotBlank @Size(min = 8, max = 72) @MaxUtf8Bytes(72) String newPassword) {

	public ResetPasswordRequest {
		email = Emails.normalize(email);
	}

}
