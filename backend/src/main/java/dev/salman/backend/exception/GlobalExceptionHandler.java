package dev.salman.backend.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;
import lombok.extern.slf4j.Slf4j;

/**
 * Renders every error as an RFC 9457 problem detail: Spring MVC's standard exceptions (malformed bodies, unknown
 * routes, wrong methods), validation failures with a per-field {@code errors} map, and anything unexpected as a 500
 * that never leaks internals. Domain exceptions get their own handlers here as they appear.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	private static final String ERRORS = "errors";

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> errors = new LinkedHashMap<>();
		for (FieldError error : ex.getBindingResult().getFieldErrors()) {
			errors.merge(error.getField(), String.valueOf(error.getDefaultMessage()), GlobalExceptionHandler::join);
		}
		ex.getBody().setProperty(ERRORS, errors);
		return super.handleMethodArgumentNotValid(ex, headers, status, request);
	}

	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> errors = new LinkedHashMap<>();
		ex.getParameterValidationResults().forEach(result -> {
			var name = result.getMethodParameter().getParameterName();
			result.getResolvableErrors().forEach(error -> errors.merge(String.valueOf(name),
					String.valueOf(error.getDefaultMessage()), GlobalExceptionHandler::join));
		});
		ex.getBody().setProperty(ERRORS, errors);
		return super.handleHandlerMethodValidationException(ex, headers, status, request);
	}

	/** The servlet container's multipart limit tripped before the upload reached us: same answer as our own check. */
	@Override
	protected ResponseEntity<Object> handleMaxUploadSizeExceededException(MaxUploadSizeExceededException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, "The image is larger than 10 MB.");
		return handleExceptionInternal(ex, problem, headers, HttpStatus.CONTENT_TOO_LARGE, request);
	}

	@ExceptionHandler(ConstraintViolationException.class)
	ProblemDetail handleConstraintViolation(ConstraintViolationException ex) {
		Map<String, String> errors = new LinkedHashMap<>();
		for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
			errors.merge(lastNode(violation.getPropertyPath()), violation.getMessage(), GlobalExceptionHandler::join);
		}
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid request content.");
		problem.setProperty(ERRORS, errors);
		return problem;
	}

	/**
	 * A row lock was not granted within the database's lock timeout (see {@code spring.datasource.hikari
	 * .connection-init-sql}): something else holds it for too long. Tell the client to retry rather than hang.
	 */
	@ExceptionHandler(PessimisticLockingFailureException.class)
	ResponseEntity<ProblemDetail> handleLockTimeout(PessimisticLockingFailureException ex) {
		log.warn("Gave up waiting for a row lock", ex);
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"The service is busy. Try again in a moment.");
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header(HttpHeaders.RETRY_AFTER, "1").body(problem);
	}

	/**
	 * Last resort. Exceptions annotated with {@code @ResponseStatus} keep that status (without echoing their
	 * message); security exceptions are rethrown so the security filters render them; everything else is a generic
	 * 500 with the cause logged.
	 */
	@ExceptionHandler(Exception.class)
	ProblemDetail handleUnexpected(Exception ex) throws Exception {
		if (ex instanceof AccessDeniedException || ex instanceof AuthenticationException) {
			throw ex;
		}
		var annotated = AnnotatedElementUtils.findMergedAnnotation(ex.getClass(), ResponseStatus.class);
		if (annotated != null) {
			HttpStatus status = annotated.code();
			var detail = annotated.reason().isEmpty() ? status.getReasonPhrase() : annotated.reason();
			return ProblemDetail.forStatusAndDetail(status, detail);
		}
		log.error("Unhandled exception", ex);
		return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred.");
	}

	private static String lastNode(Path path) {
		String last = "";
		for (Path.Node node : path) {
			last = node.getName();
		}
		return last;
	}

	private static String join(String first, String second) {
		return first + "; " + second;
	}

}
