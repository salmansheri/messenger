package dev.salman.backend.lib;

public interface EmailSender {

	void send(String to, String subject, String body);

}
