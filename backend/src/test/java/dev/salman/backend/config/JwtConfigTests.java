package dev.salman.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;


/** Pure key-handling logic: no Spring context needed. */
class JwtConfigTests {

	private static final Clock NOW = Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC);

	private static String pem(String label, byte[] der) {
		return "-----BEGIN %s-----\n%s\n-----END %s-----".formatted(label,
				Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der), label);
	}

	private static AppProperties props(String privateKey, String publicKey) {
		return new AppProperties("no-reply@example.com",
				new AppProperties.Jwt("test-issuer", Duration.ofMinutes(15), Duration.ofDays(30), privateKey, publicKey),
				new AppProperties.Otp("secret", Duration.ofMinutes(10), 5, 5, 20),
				new AppProperties.RefreshCookie(true), new AppProperties.Cors(java.util.List.of()), new AppProperties.Lookup(30), new AppProperties.Groups(20), new AppProperties.Messages(60, 120, Duration.ofMinutes(15), Duration.ofHours(1)),
				new AppProperties.Presence(Duration.ofSeconds(30), Duration.ofSeconds(5), Duration.ofSeconds(2)),
				new AppProperties.Push(10, Duration.ofSeconds(30), 5),
				new AppProperties.Storage("data/uploads", "http://localhost:8080", "secret", Duration.ofMinutes(15)),
				new AppProperties.Uploads(20, Duration.ofHours(24), Duration.ofMinutes(10)), new AppProperties.Profile(5, 10));
	}

	private static String tokenFor(JwtConfig config, AppProperties props, com.nimbusds.jose.jwk.ECKey key,
			String issuer) {
		var claims = JwtClaimsSet.builder().issuer(issuer).subject("user-1").issuedAt(NOW.instant())
				.expiresAt(NOW.instant().plusSeconds(60)).build();
		return config.jwtEncoder(key)
				.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.ES256).build(), claims))
				.getTokenValue();
	}

	@Test
	void configuredPemKeysSignTokensThatTheDecoderAccepts() throws Exception {
		var generator = KeyPairGenerator.getInstance("EC");
		generator.initialize(new ECGenParameterSpec("secp256r1"));
		var pair = generator.generateKeyPair();
		var props = props(pem("PRIVATE KEY", pair.getPrivate().getEncoded()),
				pem("PUBLIC KEY", pair.getPublic().getEncoded()));
		var config = new JwtConfig();

		var key = config.jwtSigningKey(props);
		var token = tokenFor(config, props, key, "test-issuer");

		var jwt = config.jwtDecoder(key, props, NOW).decode(token);
		assertThat(jwt.getSubject()).isEqualTo("user-1");
		assertThat(key.toECPublicKey()).isEqualTo(pair.getPublic());
	}

	@Test
	void withoutConfiguredKeysAnEphemeralKeyStillWorks() throws Exception {
		var props = props(null, null);
		var config = new JwtConfig();
		var key = config.jwtSigningKey(props);

		var token = tokenFor(config, props, key, "test-issuer");

		assertThat(config.jwtDecoder(key, props, NOW).decode(token).getSubject()).isEqualTo("user-1");
	}

	@Test
	void tokensSignedByAnotherKeyOrWithAnotherIssuerOrAfterExpiryAreRejected() throws Exception {
		var props = props(null, null);
		var config = new JwtConfig();
		var key = config.jwtSigningKey(props);
		var otherKey = config.jwtSigningKey(props);
		var decoder = config.jwtDecoder(key, props, NOW);

		assertThatThrownBy(() -> decoder.decode(tokenFor(config, props, otherKey, "test-issuer")))
				.isInstanceOf(BadJwtException.class);
		assertThatThrownBy(() -> decoder.decode(tokenFor(config, props, key, "someone-else")))
				.isInstanceOf(BadJwtException.class);

		var later = Clock.offset(NOW, Duration.ofMinutes(5));
		var token = tokenFor(config, props, key, "test-issuer");
		assertThatThrownBy(() -> config.jwtDecoder(key, props, later).decode(token))
				.isInstanceOf(BadJwtException.class);
	}

	private static KeyPair keyPair(String curve) throws Exception {
		var generator = KeyPairGenerator.getInstance("EC");
		generator.initialize(new ECGenParameterSpec(curve));
		return generator.generateKeyPair();
	}

	private static AppProperties configuredWith(KeyPair pair) {
		return props(pem("PRIVATE KEY", pair.getPrivate().getEncoded()), pem("PUBLIC KEY", pair.getPublic().getEncoded()));
	}

	@Test
	void theKeyIdIsDerivedFromThePublicKeySoItSurvivesRestartsAndMatchesOtherInstances() throws Exception {
		var props = configuredWith(keyPair("secp256r1"));
		var config = new JwtConfig();

		var first = config.jwtSigningKey(props);
		var second = config.jwtSigningKey(props);

		assertThat(first.getKeyID()).isNotBlank().isEqualTo(second.getKeyID());
		assertThat(first.getKeyID()).isEqualTo(first.computeThumbprint().toString());
	}

	@Test
	void aTokenIssuedBeforeARestartStillValidatesAfterwards() throws Exception {
		var props = configuredWith(keyPair("secp256r1"));
		var config = new JwtConfig();
		var beforeRestart = config.jwtSigningKey(props);
		var token = tokenFor(config, props, beforeRestart, "test-issuer");

		var afterRestart = config.jwtSigningKey(props);

		assertThat(config.jwtDecoder(afterRestart, props, NOW).decode(token).getSubject()).isEqualTo("user-1");
	}

	@Test
	void aPrivateKeyThatDoesNotBelongToThePublicKeyIsRejectedAtStartup() throws Exception {
		var one = keyPair("secp256r1");
		var other = keyPair("secp256r1");
		var props = props(pem("PRIVATE KEY", one.getPrivate().getEncoded()),
				pem("PUBLIC KEY", other.getPublic().getEncoded()));

		assertThatThrownBy(() -> new JwtConfig().jwtSigningKey(props)).isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("do not form a pair");
	}

	@Test
	void aKeyOnAnyCurveOtherThanP256IsRejectedAtStartup() throws Exception {
		var props = configuredWith(keyPair("secp384r1"));

		assertThatThrownBy(() -> new JwtConfig().jwtSigningKey(props)).isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("P-256");
	}

	@Test
	void tokensWithoutAnExpiryOrWithoutASubjectAreRejected() throws Exception {
		var props = props(null, null);
		var config = new JwtConfig();
		var key = config.jwtSigningKey(props);
		var decoder = config.jwtDecoder(key, props, NOW);
		var header = JwsHeader.with(SignatureAlgorithm.ES256).build();

		var noExpiry = JwtClaimsSet.builder().issuer("test-issuer").subject("user-1").issuedAt(NOW.instant()).build();
		var noSubject = JwtClaimsSet.builder().issuer("test-issuer").issuedAt(NOW.instant())
				.expiresAt(NOW.instant().plusSeconds(60)).build();

		assertThatThrownBy(() -> decoder
				.decode(config.jwtEncoder(key).encode(JwtEncoderParameters.from(header, noExpiry)).getTokenValue()))
				.isInstanceOf(BadJwtException.class);
		assertThatThrownBy(() -> decoder
				.decode(config.jwtEncoder(key).encode(JwtEncoderParameters.from(header, noSubject)).getTokenValue()))
				.isInstanceOf(BadJwtException.class);
	}

}
