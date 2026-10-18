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

	/**
	 * Emails a password-reset Verification code to a verified User. Counts against the same send limits as
	 * sign-up and does nothing visible for unknown or unverified emails.
	 */
	void requestPasswordReset(String email, String clientIp);

	/**
	 * Sets a new password using a reset code and ends every session of the User.
	 *
	 * @throws dev.salman.backend.exception.InvalidVerificationCodeException for a wrong, expired, used or
	 *         over-attempted code, or an unknown email
	 */
	void resetPassword(String email, String code, String newPassword);

}
