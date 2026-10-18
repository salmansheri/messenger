package dev.salman.backend.support;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import dev.salman.backend.lib.EmailSender;

public class RecordingEmailSender implements EmailSender {

	public record Email(String to, String subject, String body) {
	}

	private final List<Email> sent = new CopyOnWriteArrayList<>();

	@Override
	public void send(String to, String subject, String body) {
		sent.add(new Email(to, subject, body));
	}

	public List<Email> all() {
		return List.copyOf(sent);
	}

	public Optional<Email> latestTo(String to) {
		return sent.stream().filter(e -> e.to().equalsIgnoreCase(to)).reduce((first, second) -> second);
	}

	public void clear() {
		sent.clear();
	}

}
