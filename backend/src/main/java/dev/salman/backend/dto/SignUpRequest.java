package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.MaxUtf8Bytes;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignUpRequest(
		@NotBlank @Email @Size(max = 320) String email,
		@NotBlank @Size(max = 100) String displayName,
		@NotBlank @Size(min = 8, max = 72) @MaxUtf8Bytes(72) String password) {

	public SignUpRequest {
		email = Emails.normalize(email);
	}

}
