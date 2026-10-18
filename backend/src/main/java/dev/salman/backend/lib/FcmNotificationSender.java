package dev.salman.backend.lib;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;

/**
 * Sends through Firebase Cloud Messaging. Active only when {@code app.push.fcm.credentials-file} (env
 * {@code FCM_CREDENTIALS_FILE}) points at a service account key. A token FCM no longer knows is rejected; anything
 * else that goes wrong (outage, quota, credentials) is reported as temporary so the delivery is retried.
 */
@Component
@ConditionalOnExpression("!'${app.push.fcm.credentials-file:}'.isEmpty()")
public class FcmNotificationSender implements NotificationSender {

	private final FirebaseMessaging messaging;

	public FcmNotificationSender(@Value("${app.push.fcm.credentials-file}") String credentialsFile) {
		try (var key = new FileInputStream(credentialsFile)) {
			var options = FirebaseOptions.builder().setCredentials(GoogleCredentials.fromStream(key)).build();
			this.messaging = FirebaseMessaging.getInstance(FirebaseApp.initializeApp(options, "messenger"));
		}
		catch (IOException e) {
			throw new UncheckedIOException("Could not read the FCM credentials file", e);
		}
	}

	@Override
	public PushResult send(String deviceToken, String title, String body) {
		var message = com.google.firebase.messaging.Message.builder().setToken(deviceToken)
				.setNotification(Notification.builder().setTitle(title).setBody(body).build()).build();
		try {
			messaging.send(message);
			return PushResult.DELIVERED;
		}
		catch (FirebaseMessagingException e) {
			var code = e.getMessagingErrorCode();
			if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
				return PushResult.TOKEN_REJECTED;
			}
			throw new PushUnavailableException("FCM could not take the notification: " + code, e);
		}
	}

}
