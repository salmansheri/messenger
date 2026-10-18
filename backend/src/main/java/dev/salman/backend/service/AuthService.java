package dev.salman.backend.service;

import dev.salman.backend.dto.IssuedTokens;

public interface AuthService {

	/**
	 * Creates an unverified User (or refreshes an unverified one) and emails a Verification code.
	 *
	 * @return the normalized email the code was sent to
	 */
	String signUp(String email, String displayName, String password, String clientIp);

	/** Confirms the emailed Verification code and activates the User. */
	void verifyEmail(String email, String code);

	/** Emails a fresh Verification code to an unverified User; does nothing for any other email. */
	void resendVerification(String email, String clientIp);

	/**
	 * Signs in a verified User.
	 *
	 * @throws dev.salman.backend.exception.UnauthorizedException for an unknown email or wrong password
	 * @throws dev.salman.backend.exception.EmailNotVerifiedException when the password is right but the email is
	 *         not yet verified
	 */
	IssuedTokens login(String email, String password);

}
