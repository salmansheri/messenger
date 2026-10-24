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
import tools.jackson.databind.JsonNode;

/** Availability: how a User says they can be reached (#67). */
class AvailabilityTests extends RealtimeIntegrationTest {

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

	@Test
	void everyoneStartsAvailableAndAChoiceIsSeenByTheOwnerAndInPresence() throws Exception {
		client.me(ada.accessToken()).andExpect(jsonPath("$.availability").value("AVAILABLE"));
		client.presence(grace.accessToken(), conversation)
				.andExpect(jsonPath("$[0].availability").value("AVAILABLE"));

		client.setAvailability(ada.accessToken(), "BUSY").andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(ada.id())).andExpect(jsonPath("$.availability").value("BUSY"));

		client.me(ada.accessToken()).andExpect(jsonPath("$.availability").value("BUSY"));
		client.presence(grace.accessToken(), conversation).andExpect(jsonPath("$[0].userId").value(ada.id()))
				.andExpect(jsonPath("$[0].online").value(false)).andExpect(jsonPath("$[0].availability").value("BUSY"));
	}

	@Test
	void onlyTheThreeChoicesAreAccepted() throws Exception {
		client.setAvailability(ada.accessToken(), "DO_NOT_DISTURB").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.availability").value("must be one of AVAILABLE, BUSY, AWAY"));
		client.setAvailability(ada.accessToken(), null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.availability").isNotEmpty());
		client.setAvailability("not-a-jwt", "BUSY").andExpect(status().isUnauthorized());
		client.me(ada.accessToken()).andExpect(jsonPath("$.availability").value("AVAILABLE"));
		client.setAvailability(ada.accessToken(), "AWAY").andExpect(status().isOk());
	}

	@Test
	void theTwentyFirstChangeInAnHourIsRefusedWithRetryAfterAndStoresNothing() throws Exception {
		for (var n = 1; n <= 20; n++) {
			client.setAvailability(ada.accessToken(), n % 2 == 1 ? "BUSY" : "AWAY").andExpect(status().isOk());
		}

		client.setAvailability(ada.accessToken(), "AVAILABLE").andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		client.me(ada.accessToken()).andExpect(jsonPath("$.availability").value("AWAY"));
		client.setAvailability(grace.accessToken(), "BUSY").andExpect(status().isOk());
	}

	@Test
	void choosingTheOneHeldChangesNothingSendsNothingAndCostsNothing() throws Exception {
		var forGrace = listening(grace);
		for (var n = 0; n < 25; n++) {
			client.setAvailability(ada.accessToken(), "AVAILABLE").andExpect(status().isOk())
					.andExpect(jsonPath("$.availability").value("AVAILABLE"));
		}
		client.setAvailability(ada.accessToken(), "BUSY").andExpect(status().isOk());

		// The real change arrives, and nothing came before it.
		forGrace.await(AvailabilityTests::isAvailabilityChange);
		assertThat(forGrace.history()).filteredOn(AvailabilityTests::isAvailabilityChange).hasSize(1);
	}

	@Test
	void fellowParticipantsAndTheOwnersOtherSessionsHearAboutItAndStrangersDoNot() throws Exception {
		var forGrace = listening(grace);
		var otherTabOfAda = listening(ada);
		var forLinus = listening(linus);

		client.setAvailability(ada.accessToken(), "AWAY").andExpect(status().isOk());

		var heard = forGrace.await(AvailabilityTests::isAvailabilityChange);
		assertThat(heard.get("userId").asString()).isEqualTo(ada.id());
		assertThat(heard.get("availability").asString()).isEqualTo("AWAY");
		assertThat(otherTabOfAda.await(AvailabilityTests::isAvailabilityChange).get("availability").asString())
				.isEqualTo("AWAY");
		assertThat(forLinus.receivesNothingMatching(AvailabilityTests::isAvailabilityChange, 800)).isTrue();
	}

	@Test
	void groupParticipantsHearAboutItAndSeeItInPresence() throws Exception {
		var group = idOf(client.createGroup(grace.accessToken(), "Team", ada.id(), linus.id()));
		var forLinus = listening(linus);

		client.setAvailability(ada.accessToken(), "BUSY").andExpect(status().isOk());

		assertThat(forLinus.await(AvailabilityTests::isAvailabilityChange).get("userId").asString()).isEqualTo(ada.id());
		client.presence(linus.accessToken(), group)
				.andExpect(jsonPath("$[?(@.userId == '%s')].availability".formatted(ada.id())).value("BUSY"));
	}

	@Test
	void aBlockHidesAvailabilityBothWays() throws Exception {
		var group = idOf(client.createGroup(linus.accessToken(), "Team", ada.id(), grace.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var forAda = listening(ada);
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		client.setAvailability(ada.accessToken(), "BUSY").andExpect(status().isOk());
		client.setAvailability(grace.accessToken(), "AWAY").andExpect(status().isOk());

		forLinus.await(e -> isAvailabilityChange(e) && e.get("userId").asString().equals(ada.id()));
		forLinus.await(e -> isAvailabilityChange(e) && e.get("userId").asString().equals(grace.id()));
		// Each then changes again: once that reaches their own session, the other's earlier change would have too.
		client.setAvailability(ada.accessToken(), "AWAY").andExpect(status().isOk());
		client.setAvailability(grace.accessToken(), "BUSY").andExpect(status().isOk());
		forAda.await(e -> isAvailabilityChange(e) && e.get("availability").asString().equals("AWAY"));
		forGrace.await(e -> isAvailabilityChange(e) && e.get("availability").asString().equals("BUSY")
				&& e.get("userId").asString().equals(grace.id()));
		assertThat(forAda.history()).noneMatch(e -> isAvailabilityChange(e) && e.get("userId").asString().equals(grace.id()));
		assertThat(forGrace.history()).noneMatch(e -> isAvailabilityChange(e) && e.get("userId").asString().equals(ada.id()));
		client.presence(ada.accessToken(), group)
				.andExpect(jsonPath("$[?(@.userId == '%s')]".formatted(grace.id())).isEmpty());
		client.presence(grace.accessToken(), group)
				.andExpect(jsonPath("$[?(@.userId == '%s')]".formatted(ada.id())).isEmpty());
	}

	@Test
	void theConversationListDoesNotCarryIt() throws Exception {
		client.setAvailability(ada.accessToken(), "BUSY").andExpect(status().isOk());

		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].participants[*].availability").doesNotExist());
	}

	private static boolean isAvailabilityChange(JsonNode event) {
		return "availability.changed".equals(event.path("type").asString());
	}

}
