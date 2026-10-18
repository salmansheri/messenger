package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import dev.salman.backend.lib.EmailSender;
import dev.salman.backend.lib.NotificationSender;
import dev.salman.backend.support.IntegrationTest;

/** Proves the outbound ports are replaced by recording fakes so later slices can assert on what was sent. */
class HarnessTests extends IntegrationTest {

	@Autowired
	EmailSender emailSender;

	@Autowired
	NotificationSender notificationSender;

	@BeforeEach
	void reset() {
		emails.clear();
		pushes.clear();
	}

	@Test
	void emailsSentThroughThePortAreReadableByTests() {
		emailSender.send("ada@example.com", "Your code", "123456");

		assertThat(emails.latestTo("ada@example.com")).get()
				.satisfies(e -> {
					assertThat(e.subject()).isEqualTo("Your code");
					assertThat(e.body()).isEqualTo("123456");
				});
	}

	@Test
	void pushesSentThroughThePortAreReadableByTests() {
		notificationSender.send("device-1", "New message", "Hi");

		assertThat(pushes.all()).hasSize(1);
		assertThat(pushes.all().getFirst().deviceToken()).isEqualTo("device-1");
	}

}
