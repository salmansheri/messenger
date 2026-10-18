package dev.salman.backend.service.impl;

import java.util.concurrent.Executor;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.config.MailExecutorConfig;
import dev.salman.backend.dto.IssuedTokens;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.EmailNotVerifiedException;
import dev.salman.backend.exception.InvalidVerificationCodeException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.EmailSender;
import dev.salman.backend.lib.Emails;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.AuthService;
import dev.salman.backend.service.TokenService;
import dev.salman.backend.service.VerificationCodeService.Purpose;
import dev.salman.backend.service.VerificationCodeService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

	/** What each kind of code email says; {@code %s} is the code and {@code %d} the lifetime in minutes. */
	private record CodeEmail(String subject, String body) {
	}

	private static final CodeEmail EMAIL_VERIFICATION = new CodeEmail("Verify your email",
			"Your verification code is %s. It expires in %d minutes.");
	private static final CodeEmail PASSWORD_RESET = new CodeEmail("Reset your password",
			"Your password reset code is %s. It expires in %d minutes.");

	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final VerificationCodeService codes;
	private final EmailSender emailSender;
	private final AppProperties props;
	private final TokenService tokens;

	@Qualifier(MailExecutorConfig.MAIL_EXECUTOR)
	private final Executor mailExecutor;

	/** Checked against when the email is unknown, so unknown and known emails take the same time. */
	private String unknownUserPasswordHash;

	@PostConstruct
	void precomputeUnknownUserHash() {
		unknownUserPasswordHash = passwordEncoder.encode("unknown-user-placeholder");
	}

	@Override
	public String signUp(String rawEmail, String displayName, String password, String clientIp) {
		var email = Emails.normalize(rawEmail);
		codes.acquireSendPermit(email, clientIp);
		var existing = users.findByEmail(email);
		if (existing.isPresent() && existing.get().isEmailVerified()) {
			throw new ConflictException("An account with this email already exists.");
		}
		var user = existing.orElseGet(User::new);
		user.setEmail(email);
		user.setDisplayName(displayName.strip());
		user.setPasswordHash(passwordEncoder.encode(password));
		try {
			users.saveAndFlush(user);
		}
		catch (DataIntegrityViolationException e) {
			throw new ConflictException("An account with this email already exists.");
		}
		sendVerificationCode(email);
		return email;
	}

	@Override
	public void verifyEmail(String rawEmail, String code) {
		var email = Emails.normalize(rawEmail);
		var user = users.findByEmail(email).filter(u -> !u.isEmailVerified())
				.orElseThrow(InvalidVerificationCodeException::new);
		if (!codes.verify(Purpose.EMAIL_VERIFICATION, email, code)) {
			throw new InvalidVerificationCodeException();
		}
		user.setEmailVerified(true);
		users.save(user);
	}

	@Override
	public void resendVerification(String rawEmail, String clientIp) {
		var email = Emails.normalize(rawEmail);
		codes.acquireSendPermit(email, clientIp);
		users.findByEmail(email).filter(u -> !u.isEmailVerified()).ifPresent(u -> sendVerificationCode(email));
	}

	private void sendVerificationCode(String email) {
		sendCode(Purpose.EMAIL_VERIFICATION, EMAIL_VERIFICATION, email);
	}

	/**
	 * Issues a code and emails it in the background. A mail failure is logged and never reaches the caller, so
	 * the response is the same whether or not the address belongs to a User.
	 */
	private void sendCode(Purpose purpose, CodeEmail message, String email) {
		var code = codes.issue(purpose, email);
		var body = message.body().formatted(code, props.otp().ttl().toMinutes());
		mailExecutor.execute(() -> {
			try {
				emailSender.send(email, message.subject(), body);
			}
			catch (RuntimeException e) {
				log.warn("Could not send the \"{}\" email", message.subject(), e);
			}
		});
	}

	@Override
	public void requestPasswordReset(String rawEmail, String clientIp) {
		var email = Emails.normalize(rawEmail);
		codes.acquireSendPermit(email, clientIp);
		users.findByEmail(email).filter(User::isEmailVerified)
				.ifPresent(u -> sendCode(Purpose.PASSWORD_RESET, PASSWORD_RESET, email));
	}

	/**
	 * The new password is hashed first so the slow work cannot fail after the code is spent (and unknown and known
	 * emails cost the same). The User row is locked for the whole change, so no sign-in or refresh can create a
	 * session between the password change and the sessions being ended.
	 */
	@Override
	@Transactional
	public void resetPassword(String rawEmail, String code, String newPassword) {
		var email = Emails.normalize(rawEmail);
		var newHash = passwordEncoder.encode(newPassword);
		var user = users.findByEmailForUpdate(email).filter(User::isEmailVerified)
				.orElseThrow(InvalidVerificationCodeException::new);
		if (!codes.verify(Purpose.PASSWORD_RESET, email, code)) {
			throw new InvalidVerificationCodeException();
		}
		user.setPasswordHash(newHash);
		tokens.revokeAllFor(user.getId());
	}

	/** Holds the User row lock while checking the password and creating the session (see {@link #resetPassword}). */
	@Override
	@Transactional
	public IssuedTokens login(String rawEmail, String password) {
		var user = users.findByEmailForUpdate(Emails.normalize(rawEmail));
		var matches = passwordEncoder.matches(password,
				user.map(User::getPasswordHash).orElse(unknownUserPasswordHash));
		if (user.isEmpty() || !matches) {
			throw new UnauthorizedException("Invalid email or password.");
		}
		if (!user.get().isEmailVerified()) {
			throw new EmailNotVerifiedException();
		}
		return tokens.startSession(user.get());
	}

}
