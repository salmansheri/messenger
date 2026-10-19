package dev.salman.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfig {

	private static final String BEARER = "bearer-jwt";

	@Bean
	OpenAPI messengerOpenApi() {
		return new OpenAPI()
				.info(new Info().title("Rubric API").version("v1")
						.description("REST API for the messenger backend. Realtime events use STOMP over WebSocket."))
				.components(new Components().addSecuritySchemes(BEARER,
						new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
				.addSecurityItem(new SecurityRequirement().addList(BEARER));
	}

}
