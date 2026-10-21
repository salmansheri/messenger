package dev.salman.backend.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String mailFrom, Jwt jwt, Otp otp, RefreshCookie refreshCookie, Cors cors, Lookup lookup, Groups groups, Messages messages, Presence presence, Push push, Storage storage, Uploads uploads, Profile profile) {

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
	 * Per-User limits on Message writes, each counted over a minute. {@code maxSendsPerMinute}: new Messages across all
	 * Conversations. {@code maxChangesPerMinute}: edits, deletions and reactions together, which are cheaper to do and
	 * so get a looser limit. {@code editWindow} and {@code deleteWindow}: how long after sending the sender may still
	 * change the text, or delete the Message for everyone.
	 */
	public record Messages(int maxSendsPerMinute, int maxChangesPerMinute, Duration editWindow, Duration deleteWindow) {
	}

	/**
	 * {@code maxDevicesPerUser}: registered devices one User may have. {@code retryDelay}: how long a delivery waits
	 * after a temporary provider failure. {@code maxAttempts}: deliveries are given up on after this many tries.
	 */
	public record Push(int maxDevicesPerUser, Duration retryDelay, int maxAttempts) {
	}

	/**
	 * {@code ttl}: how long a connection stays online without a heartbeat (instances refresh theirs every 10 seconds).
	 * {@code offlineGrace}: how long after the last connection ends before the User is declared offline, so a page
	 * refresh does not flicker. {@code sweepInterval}: how often each instance looks for Users who have gone quiet.
	 */
	public record Presence(Duration ttl, Duration offlineGrace, Duration sweepInterval) {
	}

	/** {@code maxNameChangesPerHour}: how often one User may change their display name (a repeat of the same name is free). */
	public record Profile(int maxNameChangesPerHour) {
	}

	/**
	 * Where images are kept. {@code directory}: files live under it on this machine. {@code publicBaseUrl}: the
	 * address of this API as browsers reach it, put into signed links. {@code signingSecret}: signs and checks them
	 * (change it in production; links stop working when it changes). {@code urlTtl}: how long a link works.
	 */
	public record Storage(String directory, String publicBaseUrl, String signingSecret, Duration urlTtl) {
	}

	/**
	 * {@code maxPerMinute}: uploads per User, separate from the Message send limit. {@code unattachedLifetime}: an
	 * upload not sent with a Message by then is removed. {@code cleanupInterval}: how often to look for those.
	 */
	public record Uploads(int maxPerMinute, Duration unattachedLifetime, Duration cleanupInterval) {
	}

}
