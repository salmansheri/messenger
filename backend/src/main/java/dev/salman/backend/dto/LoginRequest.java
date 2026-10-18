package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import dev.salman.backend.lib.MaxUtf8Bytes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
		@NotBlank @Size(max = 320) String email,
		@NotBlank @Size(max = 128) @MaxUtf8Bytes(72) String password) {

	public LoginRequest {
		email = Emails.normalize(email);
	}

}
