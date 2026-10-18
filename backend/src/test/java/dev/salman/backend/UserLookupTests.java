package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class UserLookupTests extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private AuthClient client;
	private String callerEmail;
	private String token;

	@BeforeEach
	void signedInCaller() throws Exception {
		client = auth();
		callerEmail = client.registerVerified();
		token = client.loginForTokens(callerEmail, AuthClient.PASSWORD).accessToken();
	}

	private String emailOfVerifiedUser(String displayName) throws Exception {
		var email = AuthClient.uniqueEmail();
		client.registerVerified(email, displayName, AuthClient.PASSWORD);
		return email;
	}

	@Test
	void anExactEmailFindsTheVerifiedUserWithTheirIdAndDisplayNameOnly() throws Exception {
		var grace = emailOfVerifiedUser("Grace Hopper");

		client.lookup(token, grace)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(client.idOf(grace)))
				.andExpect(jsonPath("$.displayName").value("Grace Hopper"))
				.andExpect(jsonPath("$.email").doesNotExist())
				.andExpect(jsonPath("$.emailVerified").doesNotExist())
				.andExpect(jsonPath("$.passwordHash").doesNotExist());
	}

	@Test
	void theEmailIsMatchedIgnoringCaseAndSurroundingSpaces() throws Exception {
		var grace = emailOfVerifiedUser("Grace Hopper");

		client.lookup(token, "  " + grace.toUpperCase() + " ")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Grace Hopper"));
	}

	@Test
	void aCallerCanLookThemselvesUp() throws Exception {
		client.lookup(token, callerEmail)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(client.idOf(callerEmail)));
	}

	@Test
	void partialMatchesAndWildcardsFindNothing() throws Exception {
		var grace = emailOfVerifiedUser("Grace Hopper");
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
		var unverified = AuthClient.uniqueEmail();
		client.signUp(unverified, "Not Yet", AuthClient.PASSWORD).andExpect(status().isAccepted());

		var unverifiedBody = client.lookup(token, unverified).andExpect(status().isNotFound()).andReturn()
				.getResponse().getContentAsString();
		var unknownBody = client.lookup(token, AuthClient.uniqueEmail()).andExpect(status().isNotFound()).andReturn()
				.getResponse().getContentAsString();

		var unverifiedProblem = json.readTree(unverifiedBody);
		var unknownProblem = json.readTree(unknownBody);
		assertThat(unverifiedProblem.get("detail")).isEqualTo(unknownProblem.get("detail"));
		assertThat(unverifiedProblem.get("status")).isEqualTo(unknownProblem.get("status"));
		assertThat(unverifiedBody).doesNotContain("Not Yet");
	}

	@Test
	void anUnverifiedAccountBecomesFindableOnceItIsVerified() throws Exception {
		var email = AuthClient.uniqueEmail();
		client.signUp(email, "Late Bloomer", AuthClient.PASSWORD).andExpect(status().isAccepted());
		client.lookup(token, email).andExpect(status().isNotFound());

		client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());

		client.lookup(token, email).andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Late Bloomer"));
	}

	@Test
	void theEndpointRequiresAuthentication() throws Exception {
		var grace = emailOfVerifiedUser("Grace Hopper");

		client.lookupWithoutToken(grace).andExpect(status().isUnauthorized());
		client.lookup("not-a-jwt", grace).andExpect(status().isUnauthorized());
	}

	@Test
	void aMissingBlankOrOversizedEmailIsAValidationError() throws Exception {
		client.lookupBody(token, Map.of()).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
		client.lookup(token, "   ").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
		client.lookup(token, "a".repeat(400)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
	}

	@Test
	void theEmailTravelsInTheBodyNotTheUrlSoItStaysOutOfAccessLogs() throws Exception {
		var grace = emailOfVerifiedUser("Grace Hopper");

		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/users/lookup")
				.param("email", grace).header("Authorization", "Bearer " + token))
				.andExpect(status().isMethodNotAllowed());
	}

	@Test
	void aCallerMayLookUpThirtyEmailsAMinuteAndTheNextIsRefusedWithRetryAfter() throws Exception {
		for (int i = 1; i <= 30; i++) {
			client.lookup(token, AuthClient.uniqueEmail()).andExpect(status().isNotFound());
		}

		client.lookup(token, AuthClient.uniqueEmail())
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(header().exists("Retry-After"));
	}

	@Test
	void foundAndNotFoundLookupsCountTheSameAndEachCallerHasTheirOwnAllowance() throws Exception {
		var grace = emailOfVerifiedUser("Grace Hopper");
		for (int i = 1; i <= 30; i++) {
			client.lookup(token, i % 2 == 0 ? grace : AuthClient.uniqueEmail());
		}
		client.lookup(token, grace).andExpect(status().isTooManyRequests());

		var otherEmail = client.registerVerified();
		var otherToken = client.loginForTokens(otherEmail, AuthClient.PASSWORD).accessToken();
		client.lookup(otherToken, grace).andExpect(status().isOk());
	}

	@Test
	void theDatabaseItselfRefusesEmailsWithUppercaseLetters() {
		assertThatInsertIsRejected("Upper.Case@Example.com");
		assertThatInsertIsRejected("MIXED@example.com");
	}

	private void assertThatInsertIsRejected(String email) {
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
				"insert into users (id, email, display_name, password_hash, email_verified) values (?, ?, 'x', 'x', true)",
				java.util.UUID.randomUUID(), email)).isInstanceOf(DataIntegrityViolationException.class);
	}

}
