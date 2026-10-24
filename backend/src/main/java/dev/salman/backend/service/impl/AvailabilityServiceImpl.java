package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.entity.Availability;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.AvailabilityService;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AvailabilityServiceImpl implements AvailabilityService {

	private static final Duration WINDOW = Duration.ofHours(1);

	private final UserRepository users;
	private final RateLimiter rateLimiter;
	private final AppProperties props;
	private final RealtimeEvents events;
	private final AvatarLinks avatars;

	@Override
	@Transactional
	public UserProfile set(UUID userId, Availability availability) {
		// Locked, so two changes at once run one after the other and their events go out in the order they were stored.
		var user = users.findByIdForUpdate(userId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		if (user.getAvailability() != availability) {
			rateLimiter.hit("rl:availability:" + userId, props.availability().maxChangesPerHour(), WINDOW);
			user.setAvailability(availability);
			users.save(user);
			events.availabilityChanged(userId, availability);
		}
		return UserProfile.from(user, avatars.urlOf(user.getAvatarKey()));
	}

}
