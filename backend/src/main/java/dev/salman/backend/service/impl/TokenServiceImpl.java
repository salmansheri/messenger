package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.IssuedTokens;
import dev.salman.backend.entity.RefreshToken;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.ApiException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.Hashing;
import dev.salman.backend.repository.RefreshTokenRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.DeviceService;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.TokenService;
import lombok.RequiredArgsConstructor;

/** Refresh tokens are opaque random strings; only their SHA-256 is stored. */
@Service
@RequiredArgsConstructor
public class TokenServiceImpl implements TokenService {

	private final JwtEncoder jwtEncoder;
	private final RefreshTokenRepository refreshTokens;
	private final UserRepository users;
	private final RealtimeEvents events;
	private final DeviceService devices;
	private final AppProperties props;
	private final Clock clock;

	@Override
	public IssuedTokens startSession(User user) {
		return issueTokenPair(user.getId(), UUID.randomUUID());
	}

	/** Reuse revokes the session, so failures here must not roll back that revocation. */
	@Override
	@Transactional(noRollbackFor = ApiException.class)
	public IssuedTokens refresh(String refreshToken) {
		var now = clock.instant();
		var token = refreshTokens.findByTokenHash(Hashing.sha256Hex(refreshToken))
				.orElseThrow(TokenServiceImpl::invalidRefreshToken);
		// Same lock as sign-in and password reset: a refresh cannot slip a new token in after a reset.
		var user = users.findByIdForUpdate(token.getUserId());
		var reused = token.getUsedAt() != null || refreshTokens.markUsed(token.getId(), now) == 0;
		if (reused || token.getExpiresAt().isBefore(now) || user.isEmpty()) {
			refreshTokens.deleteFamily(token.getFamilyId());
			throw invalidRefreshToken();
		}
		return issueTokenPair(token.getUserId(), token.getFamilyId());
	}

	@Override
	@Transactional
	public void revoke(String refreshToken, UUID deviceId) {
		refreshTokens.findByTokenHash(Hashing.sha256Hex(refreshToken)).ifPresent(token -> {
			refreshTokens.deleteFamily(token.getFamilyId());
			if (deviceId != null) {
				devices.unregister(token.getUserId(), deviceId);
			}
		});
	}

	@Override
	@Transactional
	public void revokeAllFor(UUID userId) {
		refreshTokens.deleteAllForUser(userId);
		events.credentialsRevoked(userId); // their open sockets must not outlive the revocation
	}

	private static UnauthorizedException invalidRefreshToken() {
		return new UnauthorizedException("The refresh token is invalid or has expired.");
	}

	private IssuedTokens issueTokenPair(UUID userId, UUID familyId) {
		var now = clock.instant();
		var accessTtl = props.jwt().accessTokenTtl();
		var claims = JwtClaimsSet.builder()
				.issuer(props.jwt().issuer())
				.subject(userId.toString())
				.issuedAt(now)
				.expiresAt(now.plus(accessTtl))
				.id(UUID.randomUUID().toString())
				.build();
		var accessToken = jwtEncoder
				.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.ES256).build(), claims))
				.getTokenValue();

		var refreshValue = Hashing.randomToken();
		var refresh = new RefreshToken();
		refresh.setUserId(userId);
		refresh.setFamilyId(familyId);
		refresh.setTokenHash(Hashing.sha256Hex(refreshValue));
		refresh.setExpiresAt(now.plus(props.jwt().refreshTokenTtl()));
		refreshTokens.save(refresh);

		return new IssuedTokens(accessToken, refreshValue, accessTtl.toSeconds());
	}

}
