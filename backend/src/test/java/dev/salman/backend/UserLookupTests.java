package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class UserLookupTests extends IntegrationTest {

	private AuthClient client;

	@BeforeEach
	void newClient() {
		client = auth();
	}

	private String signedInToken() throws Exception {
		var email = client.registerVerified();
		return client.loginForTokens(email, AuthClient.PASSWORD).accessToken();
	}

	private String registeredUser(String displayName) throws Exception {
		var email = AuthClient.uniqueEmail();
		client.registerVerified(email, displayName, AuthClient.PASSWORD);
		return email;
	}

	@Test
	void anExactEmailFindsTheVerifiedUserWithTheirIdAndDisplayNameOnly() throws Exception {
		var token = signedInToken();
		var grace = registeredUser("Grace Hopper");
		var graceId = json.readTree(client.me(client.loginForTokens(grace, AuthClient.PASSWORD).accessToken())
				.andReturn().getResponse().getContentAsString()).get("id").asString();

		client.lookup(token, grace)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(graceId))
				.andExpect(jsonPath("$.displayName").value("Grace Hopper"))
				.andExpect(jsonPath("$.email").doesNotExist())
				.andExpect(jsonPath("$.emailVerified").doesNotExist())
				.andExpect(jsonPath("$.passwordHash").doesNotExist());
	}

	@Test
	void theEmailIsMatchedIgnoringCaseAndSurroundingSpaces() throws Exception {
		var token = signedInToken();
		var grace = registeredUser("Grace Hopper");

		client.lookup(token, "  " + grace.toUpperCase() + " ")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Grace Hopper"));
	}

	@Test
	void partialMatchesAndWildcardsFindNothing() throws Exception {
		var token = signedInToken();
		var grace = registeredUser("Grace Hopper");
		var local = grace.substring(0, grace.indexOf('@'));

		for (var attempt : new String[] { local, grace.substring(0, grace.length() - 1), local + "@",
				"@example.com", "%", "_", local.substring(0, 8) + "%", local.substring(0, 8) + "%@example.com",
				"%@example.com", "_".repeat(grace.length()) }) {
			client.lookup(token, attempt)
					.andExpect(status().isNotFound())
					.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
		}
	}

	@Test
	void unknownAndUnverifiedEmailsAreIndistinguishableNotFounds() throws Exception {
		var token = signedInToken();
		var unverified = AuthClient.uniqueEmail();
		client.signUp(unverified, "Not Yet", AuthClient.PASSWORD).andExpect(status().isAccepted());

		var unverifiedBody = client.lookup(token, unverified).andExpect(status().isNotFound()).andReturn()
				.getResponse().getContentAsString();
		var unknownBody = client.lookup(token, AuthClient.uniqueEmail()).andExpect(status().isNotFound()).andReturn()
				.getResponse().getContentAsString();

		assertThat(json.readTree(unverifiedBody).get("detail")).isEqualTo(json.readTree(unknownBody).get("detail"));
		assertThat(json.readTree(unverifiedBody).get("status")).isEqualTo(json.readTree(unknownBody).get("status"));
		assertThat(unverifiedBody).doesNotContain("Not Yet");
	}

	@Test
	void anUnverifiedAccountBecomesFindableOnceItIsVerified() throws Exception {
		var token = signedInToken();
		var email = AuthClient.uniqueEmail();
		client.signUp(email, "Late Bloomer", AuthClient.PASSWORD).andExpect(status().isAccepted());
		client.lookup(token, email).andExpect(status().isNotFound());

		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());

		client.lookup(token, email).andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Late Bloomer"));
	}

	@Test
	void theEndpointRequiresAuthentication() throws Exception {
		var grace = registeredUser("Grace Hopper");

		client.lookupWithoutToken(grace).andExpect(status().isUnauthorized());
		client.lookup("not-a-jwt", grace).andExpect(status().isUnauthorized());
	}

	@Test
	void aMissingOrBlankEmailIsAValidationError() throws Exception {
		var token = signedInToken();

		client.lookup(token, "   ").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
		client.lookup(token, "a".repeat(400)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/users/lookup")
				.header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
	}

}
