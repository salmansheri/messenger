package dev.salman.backend.service;

import java.util.Collection;

/** Removing stored files that nothing refers to any more, without ever blocking the change that freed them. */
public interface StaleFileService {

	/**
	 * Notes that these files are no longer used, as part of the current transaction, and removes them from storage once
	 * it commits. If that fails, or the application stops first, the periodic {@link #sweep} does it.
	 */
	void discard(Collection<String> storageKeys);

	/** Removes the files noted by {@link #discard} that are still there, then forgets them. */
	void sweep();

}
