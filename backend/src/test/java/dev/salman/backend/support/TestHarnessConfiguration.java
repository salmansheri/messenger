package dev.salman.backend.support;

import java.util.concurrent.Executor;

import org.springframework.beans.factory.annotation.Qualifier;
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

	/** Sends mail on the calling thread so tests can read the email as soon as the request returns. */
	@Bean
	@Primary
	@Qualifier("mailExecutor")
	Executor directMailExecutor() {
		return Runnable::run;
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
