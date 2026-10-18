package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.salman.backend.config.AppProperties;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.dto.UserSummary;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.Emails;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.UserService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

	private static final Duration LOOKUP_WINDOW = Duration.ofMinutes(1);

	private final UserRepository users;
	private final RateLimiter rateLimiter;
	private final AppProperties props;

	@Override
	public UserProfile profile(UUID userId) {
		return users.findById(userId)
				.map(UserProfile::from)
				.orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
	}

	@Override
	public UserSummary findVerifiedByEmail(UUID callerId, String email) {
		rateLimiter.hit("rl:lookup:" + callerId, props.lookup().maxPerMinute(), LOOKUP_WINDOW);
		return users.findByEmail(Emails.normalize(email))
				.filter(User::isEmailVerified)
				.map(UserSummary::from)
				.orElseThrow(() -> new NotFoundException("No user found for that email."));
	}

}
