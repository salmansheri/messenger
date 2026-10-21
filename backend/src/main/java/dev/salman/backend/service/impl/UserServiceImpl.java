package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.dto.UserSummary;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.Emails;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.UserService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

	private static final Duration LOOKUP_WINDOW = Duration.ofMinutes(1);
	private static final Duration NAME_WINDOW = Duration.ofHours(1);

	private final UserRepository users;
	private final RateLimiter rateLimiter;
	private final AppProperties props;
	private final RealtimeEvents events;
	private final AvatarLinks avatars;

	@Override
	public UserProfile profile(UUID userId) {
		return users.findById(userId)
				.map(user -> UserProfile.from(user, avatars.urlOf(user.getAvatarKey())))
				.orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
	}

	@Override
	@Transactional
	public UserProfile updateDisplayName(UUID userId, String displayName) {
		// Locked, so two changes at once run one after the other and their events go out in the order they were stored.
		var user = users.findByIdForUpdate(userId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		var name = displayName.strip();
		if (!name.equals(user.getDisplayName())) {
			rateLimiter.hit("rl:display-name:" + userId, props.profile().maxNameChangesPerHour(), NAME_WINDOW);
			user.setDisplayName(name);
			users.save(user);
			events.profileChanged(userId, name);
		}
		return UserProfile.from(user, avatars.urlOf(user.getAvatarKey()));
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
