package dev.salman.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

import dev.salman.backend.lib.ProblemSecurityHandlers;

@Configuration
public class SecurityConfig {

	private static final String[] PUBLIC_PATHS = { "/api/v1/auth/**", "/actuator/health/**", "/actuator/info",
			"/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html" };

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, ProblemSecurityHandlers problems) throws Exception {
		return http
				.csrf(AbstractHttpConfigurer::disable)
				.cors(Customizer.withDefaults())
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.httpBasic(AbstractHttpConfigurer::disable)
				.formLogin(AbstractHttpConfigurer::disable)
				.logout(AbstractHttpConfigurer::disable)
				.authorizeHttpRequests(a -> a
						.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
						.requestMatchers(PUBLIC_PATHS).permitAll()
						.anyRequest().authenticated())
				.exceptionHandling(e -> e
						.authenticationEntryPoint(problems)
						.accessDeniedHandler(problems))
				.build();
	}

}
