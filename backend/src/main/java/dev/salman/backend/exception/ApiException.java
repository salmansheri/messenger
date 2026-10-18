package dev.salman.backend.exception;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** A domain failure rendered as an RFC 9457 problem; the message is safe to show to the client. */
public class ApiException extends ErrorResponseException {

	private final HttpHeaders headers = new HttpHeaders();

	public ApiException(HttpStatus status, String message) {
		super(status, ProblemDetail.forStatusAndDetail(status, message), null);
	}

	/** Adds a response header that is sent along with the problem. */
	public ApiException header(String name, String value) {
		headers.add(name, value);
		return this;
	}

	protected final HttpHeaders mutableHeaders() {
		return headers;
	}

	@Override
	public HttpHeaders getHeaders() {
		return headers;
	}

}
