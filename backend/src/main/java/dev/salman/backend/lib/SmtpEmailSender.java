package dev.salman.backend.lib;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.AppProperties;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class SmtpEmailSender implements EmailSender {

	private final JavaMailSender mailSender;
	private final AppProperties props;

	@Override
	public void send(String to, String subject, String body) {
		var message = new SimpleMailMessage();
		message.setFrom(props.mailFrom());
		message.setTo(to);
		message.setSubject(subject);
		message.setText(body);
		mailSender.send(message);
	}

}
