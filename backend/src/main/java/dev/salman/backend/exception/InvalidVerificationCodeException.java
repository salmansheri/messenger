package dev.salman.backend.exception;

import org.springframework.http.HttpStatus;

/** Wrong, expired, used or over-attempted codes all look the same to the client. */
public class InvalidVerificationCodeException extends ApiException {

	public InvalidVerificationCodeException() {
		super(HttpStatus.BAD_REQUEST, "The verification code is invalid or has expired.");
	}

}
