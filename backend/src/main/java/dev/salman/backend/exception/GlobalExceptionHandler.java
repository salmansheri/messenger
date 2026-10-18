package dev.salman.backend.exception;

import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Renders Spring MVC's standard exceptions (validation, malformed bodies, unknown routes, wrong methods) as
 * RFC 9457 problem details. Domain exceptions get their own handlers here as they appear.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

}
