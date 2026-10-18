package dev.salman.backend.config;

import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.util.StringUtils;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

import lombok.extern.slf4j.Slf4j;

/** Self-issued ES256 JWTs. Time comes from the {@link Clock} bean so tests can move it. */
@Slf4j
@Configuration
public class JwtConfig {

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	@Bean
	ECKey jwtSigningKey(AppProperties props) throws Exception {
		var jwt = props.jwt();
		ECPublicKey publicKey;
		ECPrivateKey privateKey;
		if (StringUtils.hasText(jwt.privateKey()) && StringUtils.hasText(jwt.publicKey())) {
			var factory = KeyFactory.getInstance("EC");
			privateKey = (ECPrivateKey) factory.generatePrivate(new PKCS8EncodedKeySpec(pem(jwt.privateKey())));
			publicKey = (ECPublicKey) factory.generatePublic(new X509EncodedKeySpec(pem(jwt.publicKey())));
		}
		else {
			log.warn("app.jwt.private-key/public-key are not set: using an ephemeral signing key, "
					+ "so tokens will not survive a restart");
			var generator = KeyPairGenerator.getInstance("EC");
			generator.initialize(new ECGenParameterSpec("secp256r1"));
			var pair = generator.generateKeyPair();
			publicKey = (ECPublicKey) pair.getPublic();
			privateKey = (ECPrivateKey) pair.getPrivate();
		}
		return new ECKey.Builder(Curve.P_256, publicKey).privateKey(privateKey).keyUse(KeyUse.SIGNATURE)
				.algorithm(JWSAlgorithm.ES256).keyID(UUID.randomUUID().toString()).build();
	}

	@Bean
	JwtEncoder jwtEncoder(ECKey signingKey) {
		return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(signingKey)));
	}

	@Bean
	JwtDecoder jwtDecoder(ECKey signingKey, AppProperties props, Clock clock) {
		var processor = new DefaultJWTProcessor<SecurityContext>();
		processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.ES256,
				new ImmutableJWKSet<>(new JWKSet(signingKey.toPublicJWK()))));
		// Claims are validated below, against the injected clock, instead of Nimbus's system-clock verifier.
		processor.setJWTClaimsSetVerifier((claims, context) -> {
		});
		var decoder = new NimbusJwtDecoder(processor);
		var timestamps = new JwtTimestampValidator(Duration.ZERO);
		timestamps.setClock(clock);
		decoder.setJwtValidator(
				new DelegatingOAuth2TokenValidator<>(timestamps, new JwtIssuerValidator(props.jwt().issuer())));
		return decoder;
	}

	private static byte[] pem(String value) {
		return Base64.getMimeDecoder().decode(value.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", ""));
	}

}
