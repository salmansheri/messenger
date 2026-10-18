package dev.salman.backend.lib;

/** The push provider could not take the notification right now (network, quota, outage): worth trying again. */
public class PushUnavailableException extends RuntimeException {

	public PushUnavailableException(String message, Throwable cause) {
		super(message, cause);
	}

}
