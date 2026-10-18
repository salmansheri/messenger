package dev.salman.backend.support;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import dev.salman.backend.lib.NotificationSender;

public class RecordingNotificationSender implements NotificationSender {

	public record Push(String deviceToken, String title, String body) {
	}

	private final List<Push> sent = new CopyOnWriteArrayList<>();

	@Override
	public void send(String deviceToken, String title, String body) {
		sent.add(new Push(deviceToken, title, body));
	}

	public List<Push> all() {
		return List.copyOf(sent);
	}

	public void clear() {
		sent.clear();
	}

}
