package dev.salman.backend.lib;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.salman.backend.service.PresenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Keeps this instance's live sockets online in Redis (one call per User) and runs the offline sweep. If the instance
 * dies, its sockets' entries lapse after the presence ttl and the other instances' sweeps declare those Users offline.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PresenceHeartbeat {

	private final StompSessions sessions;
	private final PresenceService presence;

	@Scheduled(fixedDelayString = "PT10S")
	public void refresh() {
		var byUser = new HashMap<UUID, List<String>>();
		sessions.liveSessions().forEach((sessionId, userId) -> byUser.computeIfAbsent(userId, id -> new ArrayList<>())
				.add(sessionId));
		byUser.forEach((userId, sessionIds) -> {
			try {
				presence.refresh(userId, sessionIds);
			}
			catch (RuntimeException e) {
				log.warn("Could not refresh presence", e);
			}
		});
	}

	@Scheduled(fixedDelayString = "${app.presence.sweep-interval}")
	public void sweep() {
		try {
			presence.sweep();
		}
		catch (RuntimeException e) {
			log.warn("Could not sweep presence", e);
		}
	}

}
