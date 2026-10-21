package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.AttachmentResponse;
import dev.salman.backend.entity.Attachment;
import dev.salman.backend.lib.Images;
import dev.salman.backend.lib.ObjectStorage;
import dev.salman.backend.repository.AttachmentRepository;
import dev.salman.backend.service.AttachmentService;
import dev.salman.backend.service.RateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class AttachmentServiceImpl implements AttachmentService {

	private static final Duration UPLOAD_WINDOW = Duration.ofMinutes(1);
	private static final int SWEEP_BATCH = 100;

	private final AttachmentRepository attachments;
	private final ObjectStorage storage;
	private final RateLimiter rateLimiter;
	private final AppProperties props;
	private final Clock clock;
	private final AttachmentLoader loader;

	@Override
	public AttachmentResponse upload(UUID ownerId, byte[] bytes) {
		rateLimiter.hit("rl:upload:" + ownerId, props.uploads().maxPerMinute(), UPLOAD_WINDOW);
		var image = Images.process(bytes);

		var id = UUID.randomUUID();
		var attachment = new Attachment();
		attachment.setId(id);
		attachment.setOwnerId(ownerId);
		attachment.setStorageKey("attachments/%s/image.%s".formatted(id, image.extension()));
		attachment.setThumbnailKey("attachments/%s/thumbnail.%s".formatted(id, image.extension()));
		attachment.setContentType(image.contentType());
		attachment.setSizeBytes(image.full().length);
		attachment.setWidth(image.width());
		attachment.setHeight(image.height());
		attachment.setCreatedAt(clock.instant());

		// Files first: a row must never point at files that are not there. If anything fails after the first file is
		// stored, remove what was stored (best effort), because no row would ever lead the sweep to it.
		try {
			storage.put(attachment.getStorageKey(), image.full());
			storage.put(attachment.getThumbnailKey(), image.thumbnail());
			attachments.save(attachment);
		}
		catch (RuntimeException e) {
			discardFiles(attachment);
			throw e;
		}
		return loader.view(attachment);
	}

	@Override
	public void removeAbandoned() {
		var cutoff = clock.instant().minus(props.uploads().unattachedLifetime());
		for (var stale : attachments.findAbandoned(cutoff, Limit.of(SWEEP_BATCH))) {
			try {
				// Files first, then the row: if this fails half-way the row is still there and the next sweep retries.
				storage.delete(stale.getStorageKey());
				storage.delete(stale.getThumbnailKey());
				attachments.delete(stale);
			}
			catch (RuntimeException e) {
				log.warn("Could not remove abandoned upload {}", stale.getId(), e);
			}
		}
	}

	private void discardFiles(Attachment attachment) {
		for (var key : new String[] { attachment.getStorageKey(), attachment.getThumbnailKey() }) {
			try {
				storage.delete(key);
			}
			catch (RuntimeException e) {
				log.warn("Could not remove stray file {}", key, e);
			}
		}
	}

}
