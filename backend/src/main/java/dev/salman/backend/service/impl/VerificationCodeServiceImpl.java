package dev.salman.backend.service.impl;

import java.time.Duration;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.exception.RateLimitedException;
import dev.salman.backend.lib.Hashing;
import dev.salman.backend.service.VerificationCodeService;
import lombok.RequiredArgsConstructor;

/** Only an HMAC of each code is stored, in Redis, with a TTL; wrong attempts are counted per code. */
@Service
@RequiredArgsConstructor
public class VerificationCodeServiceImpl implements VerificationCodeService {

	private static final Duration SEND_WINDOW = Duration.ofHours(1);

	private final StringRedisTemplate redis;
	private final AppProperties props;

	@Override
	public void acquireSendPermit(String email, String clientIp) {
		count("rl:otp-send:email:" + email, props.otp().maxSendsPerHour());
		count("rl:otp-send:ip:" + clientIp, props.otp().maxSendsPerIpPerHour());
	}

	/** Fixed one-hour window: the first hit starts the window, later hits only increment. */
	private void count(String key, int limit) {
		var hits = redis.opsForValue().increment(key);
		if (hits != null && hits == 1) {
			redis.expire(key, SEND_WINDOW);
		}
		if (hits != null && hits > limit) {
			var remaining = redis.getExpire(key);
			throw new RateLimitedException(Duration.ofSeconds(remaining > 0 ? remaining : SEND_WINDOW.toSeconds()));
		}
	}

	@Override
	public String issue(Purpose purpose, String email) {
		var code = Hashing.randomDigits(6);
		redis.opsForValue().set(codeKey(purpose, email), digest(purpose, email, code), props.otp().ttl());
		redis.delete(attemptsKey(purpose, email));
		return code;
	}

	@Override
	public boolean verify(Purpose purpose, String email, String code) {
		var stored = redis.opsForValue().get(codeKey(purpose, email));
		if (stored == null || code == null) {
			return false;
		}
		var attempts = redis.opsForValue().increment(attemptsKey(purpose, email));
		if (attempts != null && attempts == 1) {
			redis.expire(attemptsKey(purpose, email), props.otp().ttl());
		}
		var max = props.otp().maxAttempts();
		if (attempts != null && attempts > max) {
			discard(purpose, email);
			return false;
		}
		if (!Hashing.constantTimeEquals(stored, digest(purpose, email, code))) {
			if (attempts != null && attempts >= max) {
				discard(purpose, email);
			}
			return false;
		}
		// Only the call that actually consumes the code succeeds, so concurrent attempts cannot both win.
		var consumed = redis.delete(codeKey(purpose, email));
		redis.delete(attemptsKey(purpose, email));
		return consumed;
	}

	private void discard(Purpose purpose, String email) {
		redis.delete(codeKey(purpose, email));
		redis.delete(attemptsKey(purpose, email));
	}

	private String digest(Purpose purpose, String email, String code) {
		return Hashing.hmacSha256Hex(props.otp().secret(), purpose + ":" + email + ":" + code);
	}

	private static String codeKey(Purpose purpose, String email) {
		return "otp:" + purpose + ":" + email;
	}

	private static String attemptsKey(Purpose purpose, String email) {
		return "otp-attempts:" + purpose + ":" + email;
	}

}
