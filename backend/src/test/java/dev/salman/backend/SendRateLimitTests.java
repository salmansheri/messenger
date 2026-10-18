package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class SendRateLimitTests extends IntegrationTest {

	@Test
	void anEmailAddressCanBeSentFiveCodesAnHourAndTheSixthIsRefusedWithRetryAfter() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		for (int resend = 1; resend <= 4; resend++) {
			client.resendVerification(email).andExpect(status().isNoContent());
		}

		client.resendVerification(email)
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(429))
				.andExpect(header().exists("Retry-After"));
	}

	@Test
	void theEmailLimitAppliesAcrossDifferentCallers() throws Exception {
		var email = AuthClient.uniqueEmail();
		auth().signUp(email).andExpect(status().isAccepted());
		for (int resend = 1; resend <= 4; resend++) {
			auth().resendVerification(email).andExpect(status().isNoContent());
		}

		auth().resendVerification(email).andExpect(status().isTooManyRequests());
	}

	@Test
	void unknownEmailsAreLimitedExactlyLikeKnownOnes() throws Exception {
		var client = auth();
		var unknown = AuthClient.uniqueEmail();
		for (int resend = 1; resend <= 5; resend++) {
			client.resendVerification(unknown).andExpect(status().isNoContent());
		}

		client.resendVerification(unknown).andExpect(status().isTooManyRequests());
	}

	@Test
	void aCallerCanTriggerTwentySendsAnHourAcrossEmailsAndTheNextIsRefused() throws Exception {
		var client = auth();
		for (int i = 1; i <= 20; i++) {
			client.signUp(AuthClient.uniqueEmail()).andExpect(status().isAccepted());
		}

		client.signUp(AuthClient.uniqueEmail())
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));

		auth().signUp(AuthClient.uniqueEmail()).andExpect(status().isAccepted());
	}

	@Test
	void aRefusedSignUpSendsNoEmail() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		for (int resend = 1; resend <= 4; resend++) {
			client.resendVerification(email).andExpect(status().isNoContent());
		}
		var sentBefore = client.emailsSentTo(email);

		client.signUp(email).andExpect(status().isTooManyRequests());

		assertThat(client.emailsSentTo(email)).isEqualTo(sentBefore);
	}

}
