package dev.salman.backend.lib;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingNotificationSender implements NotificationSender {

	private static final Logger log = LoggerFactory.getLogger(LoggingNotificationSender.class);

	@Override
	public void send(String deviceToken, String title, String body) {
		log.info("Push to {}: {} - {}", deviceToken, title, body);
	}

}
