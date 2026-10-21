package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.Collection;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.entity.StaleFile;
import dev.salman.backend.lib.AfterCommit;
import dev.salman.backend.lib.ObjectStorage;
import dev.salman.backend.repository.StaleFileRepository;
import dev.salman.backend.service.StaleFileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class StaleFileServiceImpl implements StaleFileService {

	private static final int SWEEP_BATCH = 100;

	private final StaleFileRepository stale;
	private final ObjectStorage storage;
	private final Clock clock;

	@Override
	@Transactional
	public void discard(Collection<String> storageKeys) {
		for (var key : storageKeys) {
			var file = new StaleFile();
			file.setStorageKey(key);
			file.setSince(clock.instant());
			stale.save(file);
		}
		// Files only: this runs inside the finished transaction, so a row delete here might never be flushed; the sweep
		// removes the rows (and the files again, if these deletions failed).
		AfterCommit.run(() -> storageKeys.forEach(this::tryDelete));
	}

	@Override
	public void sweep() {
		for (var file : stale.findAllByOrderBySinceAsc(Limit.of(SWEEP_BATCH))) {
			if (tryDelete(file.getStorageKey())) {
				stale.delete(file);
			}
		}
	}

	private boolean tryDelete(String key) {
		try {
			storage.delete(key);
			return true;
		}
		catch (RuntimeException e) {
			log.warn("Could not remove stored file {}", key, e);
			return false;
		}
	}

}
