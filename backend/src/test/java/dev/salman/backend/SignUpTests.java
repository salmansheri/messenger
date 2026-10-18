package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class SignUpTests extends IntegrationTest {

	@Test
	void signingUpEmailsAVerificationCodeAndConfirmingItActivatesTheAccount() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();

		client.signUp(email).andExpect(status().isAccepted());

		var mail = emails.latestTo(email).orElseThrow();
		assertThat(mail.subject()).containsIgnoringCase("verif");
		assertThat(client.latestCode(email)).matches("\\d{6}");

		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());
	}

	@Test
	void signingUpWithAnEmailThatIsAlreadyVerifiedIsAConflict() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());

		client.signUp(email)
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(409));
	}

	@Test
	void emailAddressesAreMatchedIgnoringCaseAndSurroundingSpaces() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();

		client.signUp("  " + email.toUpperCase() + " ").andExpect(status().isAccepted());

		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());
		client.signUp(email).andExpect(status().isConflict());
	}

}
