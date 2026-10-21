package dev.salman.backend.support;

import java.time.Duration;
import java.util.Optional;

import org.springframework.core.io.Resource;

import dev.salman.backend.lib.LocalObjectStorage;
import dev.salman.backend.lib.ObjectStorage;

/** The real local storage, with a switch to make deleting fail the way a broken disk or store would. */
public class FaultyObjectStorage implements ObjectStorage {

	private final LocalObjectStorage real;
	private volatile boolean failingDeletes;

	public FaultyObjectStorage(LocalObjectStorage real) {
		this.real = real;
	}

	public void failDeletes() {
		failingDeletes = true;
	}

	public void reset() {
		failingDeletes = false;
	}

	@Override
	public void put(String key, byte[] bytes) {
		real.put(key, bytes);
	}

	@Override
	public void delete(String key) {
		if (failingDeletes) {
			throw new IllegalStateException("Storage is down");
		}
		real.delete(key);
	}

	@Override
	public String signedUrl(String key, Duration ttl) {
		return real.signedUrl(key, ttl);
	}

	@Override
	public Optional<Resource> open(String key, long expiresAtEpochSecond, String signature) {
		return real.open(key, expiresAtEpochSecond, signature);
	}

}
