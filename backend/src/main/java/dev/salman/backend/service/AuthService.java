package dev.salman.backend.service;

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

}
