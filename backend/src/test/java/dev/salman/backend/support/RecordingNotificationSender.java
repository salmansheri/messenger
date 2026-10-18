package dev.salman.backend.support;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicInteger;

import dev.salman.backend.lib.NotificationSender;
import dev.salman.backend.lib.PushResult;
import dev.salman.backend.lib.PushUnavailableException;

/** Records the pushes that were delivered, and can play a provider that is down or that rejects some tokens. */
public class RecordingNotificationSender implements NotificationSender {

	public record Push(String deviceToken, String title, String body) {
	}

	private final List<Push> sent = new CopyOnWriteArrayList<>();
	private final Set<String> rejected = new CopyOnWriteArraySet<>();
	private final AtomicInteger failures = new AtomicInteger();
	private final AtomicInteger attempts = new AtomicInteger();
	private volatile RuntimeException breakage;

	@Override
	public PushResult send(String deviceToken, String title, String body) {
		attempts.incrementAndGet();
		if (breakage != null) {
			var broken = breakage;
			breakage = null;
			throw broken;
		}
		if (failures.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
			throw new PushUnavailableException("provider down", null);
		}
		if (rejected.contains(deviceToken)) {
			return PushResult.TOKEN_REJECTED;
		}
		sent.add(new Push(deviceToken, title, body));
		return PushResult.DELIVERED;
	}

	/** Pushes the provider accepted. */
	public List<Push> all() {
		return List.copyOf(sent);
	}

	/** Every call to the provider, successful or not. */
	public int attempts() {
		return attempts.get();
	}

	/** The next {@code times} calls fail as if the provider were unavailable. */
	public void failNext(int times) {
		failures.set(times);
	}

	/** The next call throws this (an unexpected error, not a temporary provider failure). */
	public void breakNext(RuntimeException error) {
		breakage = error;
	}

	/** From now on the provider says it does not know this token. */
	public void reject(String deviceToken) {
		rejected.add(deviceToken);
	}

	public void clear() {
		sent.clear();
		rejected.clear();
		failures.set(0);
		breakage = null;
		attempts.set(0);
	}

}
