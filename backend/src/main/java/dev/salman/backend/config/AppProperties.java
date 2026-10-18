package dev.salman.backend.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String mailFrom, Jwt jwt, Otp otp, RefreshCookie refreshCookie, Cors cors, Lookup lookup) {

	public record Jwt(String issuer, Duration accessTokenTtl, Duration refreshTokenTtl, String privateKey,
			String publicKey) {
	}

	public record Otp(String secret, Duration ttl, int maxAttempts, int maxSendsPerHour, int maxSendsPerIpPerHour) {
	}

	/** The refresh token's cookie; {@code secure} should only be false for plain-HTTP local development. */
	public record RefreshCookie(boolean secure) {
	}

	/** Browser origins allowed to call the API with credentials. */
	public record Cors(List<String> allowedOrigins) {
	}

	/** Throttle for the exact-email lookup, per signed-in User. */
	public record Lookup(int maxPerMinute) {
	}

}
