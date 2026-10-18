package dev.salman.backend.lib;

public interface NotificationSender {

	void send(String deviceToken, String title, String body);

}
