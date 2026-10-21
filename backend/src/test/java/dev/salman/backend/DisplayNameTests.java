package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;

/** Changing your display name (#45). */
class DisplayNameTests extends RealtimeIntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private String conversation;

	@BeforeEach
	void accounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private static boolean isProfileChange(tools.jackson.databind.JsonNode event) {
		return "profile.changed".equals(event.path("type").asString());
	}

	@Test
	void aNewNameIsStoredTrimmedAndSeenEverywhere() throws Exception {
		client.changeDisplayName(ada.accessToken(), "  Augusta Ada King  ").andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Augusta Ada King"))
				.andExpect(jsonPath("$.id").value(ada.id()));

		client.me(ada.accessToken()).andExpect(jsonPath("$.displayName").value("Augusta Ada King"));
		client.lookup(grace.accessToken(), ada.email()).andExpect(jsonPath("$.displayName").value("Augusta Ada King"));
		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].participants[?(@.userId == '%s')].displayName".formatted(ada.id()))
						.value("Augusta Ada King"));
	}

	@Test
	void aNameThatBreaksTheRulesIsRefusedAndNothingChanges() throws Exception {
		for (var bad : new Object[] { "", "   ", "x".repeat(101), "bad\u0000name" }) {
			client.changeDisplayName(ada.accessToken(), bad).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.displayName").isNotEmpty());
		}
		client.changeDisplayName(ada.accessToken(), null).andExpect(status().isBadRequest());
		client.me(ada.accessToken()).andExpect(jsonPath("$.displayName").value("Ada Lovelace"));
		client.changeDisplayName(ada.accessToken(), "😀".repeat(100)).andExpect(status().isOk());
	}

	@Test
	void aChangeNeedsASignedInUser() throws Exception {
		client.changeDisplayName("not-a-jwt", "Someone").andExpect(status().isUnauthorized());
	}

	@Test
	void theSixthChangeInAnHourIsRefusedWithRetryAfter() throws Exception {
		for (var n = 1; n <= 5; n++) {
			client.changeDisplayName(ada.accessToken(), "Ada " + n).andExpect(status().isOk());
		}

		client.changeDisplayName(ada.accessToken(), "Ada 6").andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		client.me(ada.accessToken()).andExpect(jsonPath("$.displayName").value("Ada 5"));
		client.changeDisplayName(grace.accessToken(), "Grace M. Hopper").andExpect(status().isOk());
	}

	@Test
	void savingTheSameNameChangesNothingAndDoesNotCountAgainstTheLimit() throws Exception {
		for (var n = 0; n < 8; n++) {
			client.changeDisplayName(ada.accessToken(), "  Ada Lovelace ").andExpect(status().isOk())
					.andExpect(jsonPath("$.displayName").value("Ada Lovelace"));
		}
		for (var n = 1; n <= 5; n++) {
			client.changeDisplayName(ada.accessToken(), "Ada " + n).andExpect(status().isOk());
		}
	}

	@Test
	void fellowParticipantsAndTheOwnersOtherSessionsHearAboutItAndStrangersDoNot() throws Exception {
		var forGrace = listening(grace);
		var otherTabOfAda = listening(ada);
		var forLinus = listening(linus);

		client.changeDisplayName(ada.accessToken(), "Augusta Ada King").andExpect(status().isOk());

		var heard = forGrace.await(DisplayNameTests::isProfileChange);
		assertThat(heard.get("userId").asString()).isEqualTo(ada.id());
		assertThat(heard.get("displayName").asString()).isEqualTo("Augusta Ada King");
		assertThat(otherTabOfAda.await(DisplayNameTests::isProfileChange).get("userId").asString()).isEqualTo(ada.id());
		assertThat(forLinus.receivesNothingMatching(DisplayNameTests::isProfileChange, 800)).isTrue();
	}

	@Test
	void anUnchangedNameSendsNoEvent() throws Exception {
		var forGrace = listening(grace);

		client.changeDisplayName(ada.accessToken(), "Ada Lovelace").andExpect(status().isOk());

		assertThat(forGrace.receivesNothingMatching(DisplayNameTests::isProfileChange, 800)).isTrue();
	}

	@Test
	void someoneWhoLeftTheirOnlyConversationNoLongerHearsAboutTheName() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Team", grace.id(), linus.id()));
		client.removeParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isNoContent());
		var forLinus = listening(linus);

		client.changeDisplayName(ada.accessToken(), "Augusta Ada King").andExpect(status().isOk());

		assertThat(forLinus.receivesNothingMatching(DisplayNameTests::isProfileChange, 800)).isTrue();
	}

}
