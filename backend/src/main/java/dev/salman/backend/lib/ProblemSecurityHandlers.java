package dev.salman.backend.lib;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes security failures in the same RFC 9457 shape as Spring MVC's problems: {@code status}, {@code title},
 * {@code detail} and {@code instance}, with {@code type} left out because it is the default {@code about:blank}.
 */
@Component
@RequiredArgsConstructor
public class ProblemSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

	private final JsonMapper jsonMapper;

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
			throws IOException {
		write(request, response, HttpStatus.UNAUTHORIZED, "Authentication is required to access this resource.");
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
			throws IOException {
		write(request, response, HttpStatus.FORBIDDEN, "You do not have permission to access this resource.");
	}

	private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String detail)
			throws IOException {
		Map<String, Object> problem = new LinkedHashMap<>();
		problem.put("title", status.getReasonPhrase());
		problem.put("status", status.value());
		problem.put("detail", detail);
		problem.put("instance", request.getRequestURI());

		response.setStatus(status.value());
		if (status == HttpStatus.UNAUTHORIZED) {
			response.setHeader("WWW-Authenticate", "Bearer");
		}
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write(jsonMapper.writeValueAsString(problem));
	}

}
