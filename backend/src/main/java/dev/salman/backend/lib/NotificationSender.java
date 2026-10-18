package dev.salman.backend.lib;

/** Outbound port to the push provider (FCM). */
public interface NotificationSender {

	/**
	 * Sends one notification to one device.
	 *
	 * @throws PushUnavailableException for a temporary failure, so the caller may retry
	 */
	PushResult send(String deviceToken, String title, String body);

}
