package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.Images;
import dev.salman.backend.lib.ObjectStorage;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.AvatarService;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.StaleFileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class AvatarServiceImpl implements AvatarService {

	private static final Duration WINDOW = Duration.ofHours(1);

	private final UserRepository users;
	private final ObjectStorage storage;
	private final RateLimiter rateLimiter;
	private final AppProperties props;
	private final RealtimeEvents events;
	private final StaleFileService staleFiles;
	private final AvatarLinks links;

	@Override
	@Transactional
	public UserProfile set(UUID userId, byte[] picture) {
		rateLimiter.hit("rl:avatar:" + userId, props.profile().maxAvatarChangesPerHour(), WINDOW);
		var avatar = Images.avatar(picture);
		// A new key every time: the link differs from the old one, and the old file can go without breaking the new one.
		var key = "avatars/%s/%s.%s".formatted(userId, UUID.randomUUID(), avatar.extension());
		storage.put(key, avatar.bytes());
		// Whatever goes wrong from here, including the commit itself, a file no row refers to must not be left behind.
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCompletion(int status) {
				if (status != STATUS_COMMITTED) {
					try {
						storage.delete(key);
					}
					catch (RuntimeException e) {
						log.warn("Could not remove the file of an avatar that was not saved: {}", key);
					}
				}
			}
		});
		var user = users.findByIdForUpdate(userId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		var old = user.getAvatarKey();
		user.setAvatarKey(key);
		users.save(user);
		if (old != null) {
			staleFiles.discard(List.of(old));
		}
		events.avatarChanged(userId, links.urlOf(key));
		return UserProfile.from(user, links.urlOf(key));
	}

	@Override
	@Transactional
	public void remove(UUID userId) {
		var user = users.findByIdForUpdate(userId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		if (user.getAvatarKey() == null) {
			return;
		}
		var old = user.getAvatarKey();
		user.setAvatarKey(null);
		users.save(user);
		staleFiles.discard(List.of(old));
		events.avatarChanged(userId, null);
	}

}
