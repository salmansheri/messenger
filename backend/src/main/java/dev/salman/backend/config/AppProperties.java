package dev.salman.backend.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String mailFrom, Jwt jwt, Otp otp) {

	public record Jwt(String issuer, Duration accessTokenTtl, Duration refreshTokenTtl, String privateKey,
			String publicKey) {
	}

	public record Otp(String secret, Duration ttl, int maxAttempts, int maxSendsPerHour, int maxSendsPerIpPerHour) {
	}

}
