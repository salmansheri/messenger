package dev.salman.backend.dto;

import dev.salman.backend.lib.Emails;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The email to look up. Deliberately not {@code @ValidEmail}: a partial or odd-looking address is simply "not
 * found", the same as any other miss, rather than a different kind of error.
 */
public record LookupRequest(@NotBlank @Size(max = 320) String email) {

	public LookupRequest {
		email = Emails.normalize(email);
	}

}
