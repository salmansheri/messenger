package dev.salman.backend.service;

/** Issues and checks Verification codes. */
public interface VerificationCodeService {

	enum Purpose {
		EMAIL_VERIFICATION,
		PASSWORD_RESET
	}

	/**
	 * Counts one send against the per-email and per-caller hourly limits.
	 *
	 * @throws dev.salman.backend.exception.RateLimitedException when either limit is exceeded
	 */
	void acquireSendPermit(String email, String clientIp);

	/** Creates a fresh code, replacing any earlier one for the same purpose and email. */
	String issue(Purpose purpose, String email);

	/** Checks a code and consumes it when correct. */
	boolean verify(Purpose purpose, String email, String code);

}
