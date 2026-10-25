package dev.salman.backend.lib;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.salman.backend.service.StoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Removes expired Stories every {@code app.stories.sweep-interval}; see {@link StoryService#removeExpired}. */
@Slf4j
@Component
@RequiredArgsConstructor
public class ExpiredStorySweeper {

	private final StoryService stories;

	@Scheduled(fixedDelayString = "${app.stories.sweep-interval}")
	public void sweep() {
		try {
			stories.removeExpired();
		}
		catch (RuntimeException e) {
			log.warn("Could not remove expired Stories", e);
		}
	}

}
