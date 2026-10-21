package dev.salman.backend.lib;

import java.time.Duration;

/** Outbound port to an S3-compatible object store holding images. Clients fetch objects through signed URLs. */
public interface ObjectStorage {

	void put(String key, byte[] bytes, String contentType);

	/** Removes an object; one that is not there is not an error. */
	void delete(String key);

	/** A URL anyone holding it can use to fetch the object until it lapses after {@code ttl}. */
	String signedUrl(String key, Duration ttl);

}
