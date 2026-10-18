package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.List;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.exception.RateLimitedException;
import dev.salman.backend.lib.Hashing;
import dev.salman.backend.service.VerificationCodeService;
import lombok.RequiredArgsConstructor;

/**
 * Only an HMAC of each code is stored, in Redis, with a TTL; wrong attempts are counted per code.
 *
 * <p>Every read-modify-write runs as one Lua script, so concurrent requests (and a resend racing a verification)
 * see a consistent state, and a counter can never be left without its TTL.
 */
@Service
@RequiredArgsConstructor
public class VerificationCodeServiceImpl implements VerificationCodeService {

	private static final Duration SEND_WINDOW = Duration.ofHours(1);

	/** KEYS: code, attempts. ARGV: digest, ttl millis. Replaces the code and resets its attempt counter. */
	private static final RedisScript<Long> ISSUE = script("""
			redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
			redis.call('DEL', KEYS[2])
			return 1
			""", Long.class);

	/**
	 * KEYS: code, attempts. ARGV: digest, max attempts, ttl millis. Returns 1 only for the call that consumes a
	 * matching code; the code is discarded once the attempt limit is reached.
	 */
	private static final RedisScript<Long> VERIFY = script("""
			local stored = redis.call('GET', KEYS[1])
			if not stored then return 0 end
			local attempts = redis.call('INCR', KEYS[2])
			if redis.call('PTTL', KEYS[2]) < 0 then redis.call('PEXPIRE', KEYS[2], ARGV[3]) end
			local max = tonumber(ARGV[2])
			if attempts > max or stored ~= ARGV[1] then
			  if attempts >= max then redis.call('DEL', KEYS[1], KEYS[2]) end
			  return 0
			end
			redis.call('DEL', KEYS[1], KEYS[2])
			return 1
			""", Long.class);

	/** KEYS: counter. ARGV: window millis. Returns {hits, millis until the window ends}. */
	private static final RedisScript<List> COUNT = script("""
			local hits = redis.call('INCR', KEYS[1])
			if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
			return {hits, redis.call('PTTL', KEYS[1])}
			""", List.class);

	private final StringRedisTemplate redis;
	private final AppProperties props;

	@Override
	public void acquireSendPermit(String email, String clientIp) {
		count("rl:otp-send:email:" + email, props.otp().maxSendsPerHour());
		count("rl:otp-send:ip:" + clientIp, props.otp().maxSendsPerIpPerHour());
	}

	/** Fixed one-hour window: the first hit starts the window, later hits only increment. */
	private void count(String key, int limit) {
		List<?> result = redis.execute(COUNT, List.of(key), String.valueOf(SEND_WINDOW.toMillis()));
		var hits = ((Number) result.get(0)).longValue();
		if (hits > limit) {
			var millisLeft = ((Number) result.get(1)).longValue();
			throw new RateLimitedException(Duration.ofMillis(millisLeft > 0 ? millisLeft : SEND_WINDOW.toMillis()));
		}
	}

	@Override
	public String issue(Purpose purpose, String email) {
		var code = Hashing.randomDigits(6);
		redis.execute(ISSUE, keys(purpose, email), digest(purpose, email, code),
				String.valueOf(props.otp().ttl().toMillis()));
		return code;
	}

	@Override
	public boolean verify(Purpose purpose, String email, String code) {
		if (code == null) {
			return false;
		}
		var consumed = redis.execute(VERIFY, keys(purpose, email), digest(purpose, email, code),
				String.valueOf(props.otp().maxAttempts()), String.valueOf(props.otp().ttl().toMillis()));
		return Long.valueOf(1).equals(consumed);
	}

	private String digest(Purpose purpose, String email, String code) {
		return Hashing.hmacSha256Hex(props.otp().secret(), purpose + ":" + email + ":" + code);
	}

	private static List<String> keys(Purpose purpose, String email) {
		return List.of("otp:" + purpose + ":" + email, "otp-attempts:" + purpose + ":" + email);
	}

	private static <T> RedisScript<T> script(String lua, Class<T> resultType) {
		return new DefaultRedisScript<>(lua, resultType);
	}

}
