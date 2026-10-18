package dev.salman.backend.config;

import java.time.Duration;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Only the listed frontends may call the API from a browser, with credentials (the refresh cookie). A request
 * from any other origin is rejected, which together with SameSite=Strict is the CSRF defence for the cookie.
 */
@Configuration
public class CorsConfig {

	@Bean
	CorsConfigurationSource corsConfigurationSource(AppProperties props) {
		var cors = new CorsConfiguration();
		cors.setAllowedOrigins(props.cors().allowedOrigins());
		cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
		cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
		// A browser hides every other response header from the page; the frontend needs this one to say when to retry.
		cors.setExposedHeaders(List.of("Retry-After"));
		cors.setAllowCredentials(true);
		cors.setMaxAge(Duration.ofHours(1));
		var source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", cors);
		return source;
	}

}
