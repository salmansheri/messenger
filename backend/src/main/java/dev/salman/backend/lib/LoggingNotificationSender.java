package dev.salman.backend.lib;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/** Used while no FCM credentials are configured (`app.push.fcm.credentials-file`); it never logs the device token or the message text. */
@Slf4j
@Component
@ConditionalOnExpression("'${app.push.fcm.credentials-file:}'.isEmpty()")
public class LoggingNotificationSender implements NotificationSender {

	@Override
	public PushResult send(String deviceToken, String title, String body) {
		log.info("Push requested: {}", title);
		return PushResult.DELIVERED;
	}

}
