package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assumptions.assumeThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class VerifyEmailTests extends IntegrationTest {

	private static final String WRONG = "000000";

	private String signedUpEmail(AuthClient client) throws Exception {
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		return email;
	}

	/** A code that differs from the real one, whatever it happens to be. */
	private static String otherThan(String code) {
		return code.equals(WRONG) ? "111111" : WRONG;
	}

	@Test
	void aWrongCodeIsRejectedAsAProblemAndTheRightCodeStillWorks() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var code = client.latestCode(email);

		client.verifyEmail(email, otherThan(code))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(400));

		client.verifyEmail(email, code).andExpect(status().isNoContent());
	}

	@Test
	void afterFiveWrongAttemptsEvenTheCorrectCodeIsRejectedUntilANewOneIsRequested() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var code = client.latestCode(email);

		for (int attempt = 1; attempt <= 5; attempt++) {
			client.verifyEmail(email, otherThan(code)).andExpect(status().isBadRequest());
		}

		client.verifyEmail(email, code).andExpect(status().isBadRequest());

		client.resendVerification(email).andExpect(status().isNoContent());
		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());
	}

	@Test
	void theFifthAttemptStillSucceedsWhenItIsCorrect() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var code = client.latestCode(email);

		for (int attempt = 1; attempt <= 4; attempt++) {
			client.verifyEmail(email, otherThan(code)).andExpect(status().isBadRequest());
		}

		client.verifyEmail(email, code).andExpect(status().isNoContent());
	}

	@Test
	void anExpiredCodeIsRejected() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var code = client.latestCode(email);

		Thread.sleep(4_500);

		client.verifyEmail(email, code).andExpect(status().isBadRequest());
	}

	@Test
	void aCodeCanOnlyBeUsedOnce() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var code = client.latestCode(email);

		client.verifyEmail(email, code).andExpect(status().isNoContent());

		client.verifyEmail(email, code).andExpect(status().isBadRequest());
	}

	@Test
	void resendingIssuesANewCodeAndInvalidatesThePreviousOne() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var first = client.latestCode(email);

		client.resendVerification(email).andExpect(status().isNoContent());
		var second = client.latestCode(email);

		assertThat(client.emailsSentTo(email)).isEqualTo(2);
		assumeThat(second).as("two random codes happened to be equal").isNotEqualTo(first);
		client.verifyEmail(email, first).andExpect(status().isBadRequest());
		client.verifyEmail(email, second).andExpect(status().isNoContent());
	}

	@Test
	void resendingForUnknownOrAlreadyVerifiedEmailsSendsNothingAndLooksTheSame() throws Exception {
		var client = auth();
		var unknown = AuthClient.uniqueEmail();
		client.resendVerification(unknown).andExpect(status().isNoContent());
		assertThat(client.emailsSentTo(unknown)).isZero();

		var verified = signedUpEmail(client);
		client.verifyEmail(verified, client.latestCode(verified)).andExpect(status().isNoContent());
		client.resendVerification(verified).andExpect(status().isNoContent());
		assertThat(client.emailsSentTo(verified)).isEqualTo(1);
	}

	@Test
	void verifyingAnUnknownEmailLooksLikeAWrongCode() throws Exception {
		auth().verifyEmail(AuthClient.uniqueEmail(), "123456").andExpect(status().isBadRequest());
	}

	@Test
	void reRegisteringAnUnverifiedEmailSendsANewCodeAndOnlyTheNewCodeWorks() throws Exception {
		var client = auth();
		var email = signedUpEmail(client);
		var first = client.latestCode(email);

		client.signUp(email, "Ada Again", "another-long-password").andExpect(status().isAccepted());
		var second = client.latestCode(email);

		assertThat(client.emailsSentTo(email)).isEqualTo(2);
		assumeThat(second).as("two random codes happened to be equal").isNotEqualTo(first);
		client.verifyEmail(email, first).andExpect(status().isBadRequest());
		client.verifyEmail(email, second).andExpect(status().isNoContent());
	}

}
