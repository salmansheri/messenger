package dev.salman.backend.service.impl;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserBlockRepository;
import lombok.RequiredArgsConstructor;

/**
 * Who sees a User's Stories: everyone they share a Direct conversation with (sharing only a Group is not enough), less
 * anyone either of them has blocked. The rule is symmetric, so it is also whose Stories the User sees.
 */
@Component
@RequiredArgsConstructor
class StoryAudience {

	private final ParticipantRepository participants;
	private final UserBlockRepository blocks;

	Set<UUID> of(UUID userId) {
		var audience = new LinkedHashSet<>(participants.findDirectPartnerIds(userId));
		audience.removeAll(blocks.findBlockedEitherWayWith(userId));
		return audience;
	}

}
