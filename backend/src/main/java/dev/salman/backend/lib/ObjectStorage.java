package dev.salman.backend.lib;

import java.time.Duration;
import java.util.Optional;

import org.springframework.core.io.Resource;

/** Outbound port to the store holding images. Clients fetch objects through signed URLs, never directly. */
public interface ObjectStorage {

	void put(String key, byte[] bytes);

	/** Removes an object; one that is not there is not an error. */
	void delete(String key);

	/** A URL anyone holding it can use to fetch the object until it lapses after {@code ttl}. */
	String signedUrl(String key, Duration ttl);

	/**
	 * The object behind a signed URL, or empty when the signature is wrong, the link has lapsed or the object is gone.
	 * The three cases are deliberately not told apart.
	 */
	Optional<Resource> open(String key, long expiresAtEpochSecond, String signature);

}
