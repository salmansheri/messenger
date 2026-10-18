package dev.salman.backend.lib;

import java.util.UUID;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.salman.backend.service.PresenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Keeps this instance's live sockets online in Redis. If the instance dies, its sockets' entries lapse after the
 * presence ttl and its users go offline without anyone having to notice.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PresenceHeartbeat {

	private final StompSessions sessions;
	private final PresenceService presence;

	@Scheduled(fixedDelayString = "PT10S")
	public void refresh() {
		sessions.liveSessions().forEach((sessionId, userId) -> {
			try {
				presence.refresh(UUID.fromString(userId), sessionId);
			}
			catch (RuntimeException e) {
				log.warn("Could not refresh presence", e);
			}
		});
	}

}
