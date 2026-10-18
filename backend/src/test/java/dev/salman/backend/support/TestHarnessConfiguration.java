package dev.salman.backend.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
public class TestHarnessConfiguration {

	@Bean
	@Primary
	RecordingEmailSender recordingEmailSender() {
		return new RecordingEmailSender();
	}

	@Bean
	@Primary
	MutableClock testClock() {
		return new MutableClock();
	}

	@Bean
	@Primary
	RecordingNotificationSender recordingNotificationSender() {
		return new RecordingNotificationSender();
	}

}
