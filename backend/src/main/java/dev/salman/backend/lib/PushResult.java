package dev.salman.backend.lib;

/** What the push provider said about one device token. A temporary failure is a {@link PushUnavailableException}. */
public enum PushResult {

	DELIVERED,

	/** The provider does not know this token (any more): the device is gone and its token should be forgotten. */
	TOKEN_REJECTED

}
