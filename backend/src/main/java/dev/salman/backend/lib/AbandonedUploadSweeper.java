package dev.salman.backend.lib;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.salman.backend.service.AttachmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Periodically removes uploads that were never sent with a Message. Every instance runs it; it is idempotent. */
@Slf4j
@Component
@RequiredArgsConstructor
public class AbandonedUploadSweeper {

	private final AttachmentService attachments;

	@Scheduled(fixedDelayString = "${app.uploads.cleanup-interval}")
	public void sweep() {
		try {
			attachments.removeAbandoned();
		}
		catch (RuntimeException e) {
			log.warn("Could not remove abandoned uploads", e);
		}
	}

}
