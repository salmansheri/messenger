package dev.salman.backend.lib;

import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/** Default {@link NotificationSender} until a real provider is wired in; it never logs the device token. */
@Slf4j
@Component
public class LoggingNotificationSender implements NotificationSender {

	@Override
	public void send(String deviceToken, String title, String body) {
		log.info("Push requested: {}", title);
	}

}
