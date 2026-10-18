package dev.salman.backend.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String mailFrom, Jwt jwt, Otp otp, RefreshCookie refreshCookie, Cors cors, Lookup lookup, Groups groups, Presence presence, Push push) {

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

	/** Limit on how many Groups one User may create per hour (failed attempts count). */
	public record Groups(int maxCreatedPerHour) {
	}

	/**
	 * {@code ttl}: how long a connection stays online without a heartbeat (instances refresh theirs every 10 seconds).
	 * {@code offlineGrace}: how long after the last connection ends before the User is declared offline, so a page
	 * refresh does not flicker. {@code sweepInterval}: how often each instance looks for Users who have gone quiet.
	 */
	/**
	 * {@code maxDevicesPerUser}: registered devices one User may have. {@code retryDelay}: how long a delivery waits
	 * after a temporary provider failure. {@code maxAttempts}: deliveries are given up on after this many tries.
	 */
	public record Push(int maxDevicesPerUser, Duration retryDelay, int maxAttempts) {
	}

	public record Presence(Duration ttl, Duration offlineGrace, Duration sweepInterval) {
	}

}
