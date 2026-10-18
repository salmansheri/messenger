package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class AuthInputValidationTests extends IntegrationTest {

	@Test
	void aMalformedEmailIsRejectedWithAnErrorOnTheEmailField() throws Exception {
		var client = auth();

		client.signUp("no-at-sign", "Ada", AuthClient.PASSWORD)
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
	}

	@Test
	void anOversizedEmailIsRejected() throws Exception {
		var tooLong = "a".repeat(310) + "@example.com";

		auth().signUp(tooLong, "Ada", AuthClient.PASSWORD)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
	}

	@Test
	void aBlankOrOversizedDisplayNameIsRejected() throws Exception {
		var client = auth();

		client.signUp(AuthClient.uniqueEmail(), "   ", AuthClient.PASSWORD)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.displayName").isNotEmpty());
		client.signUp(AuthClient.uniqueEmail(), "x".repeat(101), AuthClient.PASSWORD)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.displayName").isNotEmpty());
	}

	@Test
	void aShortPasswordIsRejected() throws Exception {
		auth().signUp(AuthClient.uniqueEmail(), "Ada", "short")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").isNotEmpty());
	}

	@Test
	void aPasswordLongerThanTheHashCanUseIsRejectedWhetherMeasuredInCharactersOrBytes() throws Exception {
		var client = auth();

		client.signUp(AuthClient.uniqueEmail(), "Ada", "p".repeat(73))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").isNotEmpty());
		// 40 characters but 80 bytes in UTF-8
		client.signUp(AuthClient.uniqueEmail(), "Ada", "é".repeat(40))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").isNotEmpty());
	}

	@Test
	void aLongPasswordWithinTheLimitIsAccepted() throws Exception {
		auth().signUp(AuthClient.uniqueEmail(), "Ada", "é".repeat(36)).andExpect(status().isAccepted());
	}

	@Test
	void missingFieldsAreEachReported() throws Exception {
		auth().postJson("/api/v1/auth/signup", Map.of())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty())
				.andExpect(jsonPath("$.errors.displayName").isNotEmpty())
				.andExpect(jsonPath("$.errors.password").isNotEmpty());
	}

	@Test
	void rejectedInputSendsNoEmail() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();

		client.signUp(email, "Ada", "short").andExpect(status().isBadRequest());

		assertThat(client.emailsSentTo(email)).isZero();
	}

	@Test
	void aVerificationCodeThatIsNotSixDigitsIsRejectedAsInvalidInput() throws Exception {
		var client = auth();

		for (var code : new String[] { "12345", "1234567", "abcdef", "" }) {
			client.verifyEmail(AuthClient.uniqueEmail(), code)
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.code").isNotEmpty());
		}
	}

	@Test
	void verifyAndResendRejectAMalformedEmail() throws Exception {
		var client = auth();

		client.verifyEmail("nope", "123456")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
		client.resendVerification("nope")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
	}

}
