package dev.salman.backend.exception;

import org.springframework.http.HttpStatus;

public class EmailNotVerifiedException extends ApiException {

	public EmailNotVerifiedException() {
		super(HttpStatus.FORBIDDEN, "Verify your email address before signing in.");
	}

}
