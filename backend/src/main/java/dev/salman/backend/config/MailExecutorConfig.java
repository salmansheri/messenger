package dev.salman.backend.config;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Emails are sent off the request path, so response time and errors do not depend on the mail server. */
@Configuration
public class MailExecutorConfig {

	public static final String MAIL_EXECUTOR = "mailExecutor";

	@Bean(MAIL_EXECUTOR)
	@Qualifier(MAIL_EXECUTOR)
	Executor mailExecutor() {
		return Executors.newVirtualThreadPerTaskExecutor();
	}

}
