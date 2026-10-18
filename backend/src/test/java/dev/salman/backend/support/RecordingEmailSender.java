package dev.salman.backend.support;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import dev.salman.backend.lib.EmailSender;

public class RecordingEmailSender implements EmailSender {

	public record Email(String to, String subject, String body) {
	}

	private final List<Email> sent = new CopyOnWriteArrayList<>();
	private final Set<String> failing = ConcurrentHashMap.newKeySet();

	@Override
	public void send(String to, String subject, String body) {
		if (failing.contains(to.toLowerCase())) {
			throw new IllegalStateException("SMTP is down for " + to);
		}
		sent.add(new Email(to, subject, body));
	}

	public List<Email> all() {
		return List.copyOf(sent);
	}

	public Optional<Email> latestTo(String to) {
		return sent.stream().filter(e -> e.to().equalsIgnoreCase(to)).reduce((first, second) -> second);
	}

	/** Makes every send to this address throw, like an unreachable mail server. */
	public void failFor(String to) {
		failing.add(to.toLowerCase());
	}

	public void clearFailures() {
		failing.clear();
	}

	public void clear() {
		sent.clear();
	}

}
