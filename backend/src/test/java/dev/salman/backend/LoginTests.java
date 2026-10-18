package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class LoginTests extends IntegrationTest {

	@Test
	void aVerifiedUserSignsInAndGetsAnAccessTokenAndARefreshToken() throws Exception {
		var client = auth();
		var email = client.registerVerified();

		client.login(email, AuthClient.PASSWORD)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.tokenType").value("Bearer"))
				.andExpect(jsonPath("$.accessToken").isNotEmpty())
				.andExpect(jsonPath("$.refreshToken").isNotEmpty())
				.andExpect(jsonPath("$.expiresIn").value(900));
	}

	@Test
	void emailsAreMatchedIgnoringCaseAndSurroundingSpaces() throws Exception {
		var client = auth();
		var email = client.registerVerified();

		client.login("  " + email.toUpperCase() + "  ", AuthClient.PASSWORD).andExpect(status().isOk());
	}

	@Test
	void aWrongPasswordAndAnUnknownEmailAreRefusedIdentically() throws Exception {
		var client = auth();
		var email = client.registerVerified();

		var wrongPassword = client.login(email, "not-the-password")
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andReturn().getResponse().getContentAsString();
		var unknownEmail = client.login(AuthClient.uniqueEmail(), AuthClient.PASSWORD)
				.andExpect(status().isUnauthorized())
				.andReturn().getResponse().getContentAsString();

		assertThat(json.readTree(wrongPassword).get("detail")).isEqualTo(json.readTree(unknownEmail).get("detail"));
	}

	@Test
	void anUnverifiedUserWithTheRightPasswordIsToldToVerifyTheirEmail() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());

		client.login(email, AuthClient.PASSWORD)
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.status").value(403))
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsStringIgnoringCase("verif")));
	}

	@Test
	void anUnverifiedAccountDoesNotRevealItselfToSomeoneWhoDoesNotKnowThePassword() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());

		client.login(email, "not-the-password").andExpect(status().isUnauthorized());
	}

	@Test
	void signInWorksAfterVerifyingAndNotBefore() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		client.login(email, AuthClient.PASSWORD).andExpect(status().isForbidden());

		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());

		client.login(email, AuthClient.PASSWORD).andExpect(status().isOk());
	}

	@Test
	void reRegisteringAnUnverifiedEmailReplacesThePasswordAndDisplayName() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email, "First Name", "first-password-123").andExpect(status().isAccepted());
		client.signUp(email, "Second Name", "second-password-456").andExpect(status().isAccepted());
		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());

		client.login(email, "first-password-123").andExpect(status().isUnauthorized());
		var tokens = client.loginForTokens(email, "second-password-456");

		client.me(tokens.accessToken()).andExpect(jsonPath("$.displayName").value("Second Name"));
	}

	@Test
	void theProfileEndpointReturnsTheSignedInUser() throws Exception {
		var client = auth();
		var email = client.registerVerified();
		var tokens = client.loginForTokens(email, AuthClient.PASSWORD);

		client.me(tokens.accessToken())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.email").value(email))
				.andExpect(jsonPath("$.displayName").value("Ada Lovelace"))
				.andExpect(jsonPath("$.emailVerified").value(true))
				.andExpect(jsonPath("$.passwordHash").doesNotExist());
	}

	@Test
	void protectedEndpointsRejectMissingMalformedAndForgedTokens() throws Exception {
		var client = auth();
		var email = client.registerVerified();
		var real = client.loginForTokens(email, AuthClient.PASSWORD).accessToken();

		client.meWithoutToken().andExpect(status().isUnauthorized());
		client.me("not-a-jwt").andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Bearer")));

		var parts = real.split("\\.");
		var tampered = parts[0] + "." + parts[1] + "." + new StringBuilder(parts[2]).reverse();
		client.me(tampered).andExpect(status().isUnauthorized());
		var unsigned = parts[0] + "." + parts[1] + ".";
		client.me(unsigned).andExpect(status().isUnauthorized());
	}

	@Test
	void anAccessTokenStopsWorkingAfterFifteenMinutes() throws Exception {
		var client = auth();
		var email = client.registerVerified();
		var token = client.loginForTokens(email, AuthClient.PASSWORD).accessToken();

		clock.advance(Duration.ofMinutes(14));
		client.me(token).andExpect(status().isOk());

		clock.advance(Duration.ofMinutes(2));
		client.me(token).andExpect(status().isUnauthorized());
	}

}
