package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import dev.salman.backend.lib.PresenceHeartbeat;
import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import dev.salman.backend.support.StompTestClient;
import tools.jackson.databind.JsonNode;

class PresenceTests extends RealtimeIntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	PresenceHeartbeat heartbeat;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private String conversation;

	@BeforeEach
	void adaAndGraceTalk() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private static boolean presenceOf(JsonNode event, Account who, boolean online) {
		return "presence.changed".equals(event.path("type").asString())
				&& who.id().equals(event.path("userId").asString()) && event.path("online").asBoolean() == online;
	}

	/** Opens a socket and returns it once the server has registered the connection (CONNECTED seen). */
	private StompTestClient connected(Account who) throws Exception {
		var socket = StompTestClient.connect(port, who.accessToken(), json);
		open.add(socket);
		assertThat(socket.awaitConnected()).as(socket.refusal()).isTrue();
		return socket;
	}

	// ---- going online and offline

	@Test
	void aUserTurnsOnlineWhenTheyConnectAndTheirContactsAreToldLive() throws Exception {
		var forAda = listening(ada);
		client.presence(ada.accessToken(), conversation).andExpect(status().isOk())
				.andExpect(jsonPath("$[0].online").value(false));

		connected(grace);

		var event = forAda.await(e -> presenceOf(e, grace, true));
		assertThat(event.get("lastSeenAt").isNull()).as("no last-seen while online").isTrue();
		assertThat(event.toString()).doesNotContain("@example.com");
		client.presence(ada.accessToken(), conversation)
				.andExpect(jsonPath("$[0].userId").value(grace.id()))
				.andExpect(jsonPath("$[0].online").value(true))
				.andExpect(jsonPath("$[0].lastSeenAt").doesNotExist());
	}

	@Test
	void aUserNeverSeenOnlineShowsAsOfflineWithNoLastSeen() throws Exception {
		client.presence(ada.accessToken(), conversation)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].userId").value(grace.id()))
				.andExpect(jsonPath("$[0].online").value(false))
				.andExpect(jsonPath("$[0].lastSeenAt").doesNotExist());
	}

	@Test
	void afterTheLastConnectionEndsTheUserTurnsOfflineAndTheirLastSeenIsStored() throws Exception {
		var forAda = listening(ada);
		var forGrace = connected(grace);
		forAda.await(e -> presenceOf(e, grace, true));
		var before = Instant.now();

		forGrace.close();

		var event = forAda.await(e -> presenceOf(e, grace, false));
		var lastSeen = Instant.parse(event.get("lastSeenAt").asString());
		assertThat(lastSeen).isBetween(before.minusSeconds(5), Instant.now());
		client.presence(ada.accessToken(), conversation)
				.andExpect(jsonPath("$[0].online").value(false))
				.andExpect(jsonPath("$[0].lastSeenAt").value(event.get("lastSeenAt").asString()));
		assertThat(jdbc.queryForObject("select last_seen_at is not null from users where id = ?", Boolean.class,
				UUID.fromString(grace.id()))).isTrue();
	}

	@Test
	void aUserWithSeveralConnectionsStaysOnlineUntilTheLastOneDrops() throws Exception {
		var forAda = listening(ada);
		var phone = connected(grace);
		var laptop = connected(grace);
		forAda.await(e -> presenceOf(e, grace, true));

		phone.close();

		assertThat(forAda.receivesNothingMatching(e -> presenceOf(e, grace, false), 2_500))
				.as("still on the laptop").isTrue();
		client.presence(ada.accessToken(), conversation).andExpect(jsonPath("$[0].online").value(true));

		laptop.close();

		assertThat(forAda.await(e -> presenceOf(e, grace, false))).isNotNull();
	}

	@Test
	void reconnectingWithinTheGracePeriodNeverShowsTheUserAsOffline() throws Exception {
		var forAda = listening(ada);
		var first = connected(grace);
		forAda.await(e -> presenceOf(e, grace, true));

		first.close(); // a page refresh
		connected(grace);

		assertThat(forAda.receivesNothingMatching(e -> presenceOf(e, grace, false), 2_500)).isTrue();
		client.presence(ada.accessToken(), conversation).andExpect(jsonPath("$[0].online").value(true));
	}

	@Test
	void aUserTheServerStopsHearingFromGoesOfflineWhenTheirEntryLapses() throws Exception {
		connected(grace);
		client.presence(ada.accessToken(), conversation).andExpect(jsonPath("$[0].online").value(true));

		clock.advance(Duration.ofSeconds(31)); // no heartbeat refresh, as after an instance crash

		client.presence(ada.accessToken(), conversation).andExpect(jsonPath("$[0].online").value(false));

		heartbeat.refresh(); // the socket is in fact alive and the instance refreshes it
		client.presence(ada.accessToken(), conversation).andExpect(jsonPath("$[0].online").value(true));
	}

	@Test
	void theHeartbeatKeepsALiveConnectionOnlinePastTheLifetimeOfAnEntry() throws Exception {
		connected(grace);

		for (int i = 0; i < 4; i++) {
			clock.advance(Duration.ofSeconds(20));
			heartbeat.refresh();
		}

		client.presence(ada.accessToken(), conversation).andExpect(jsonPath("$[0].online").value(true));
	}

	// ---- who can see it

	@Test
	void strangersNeitherHearAboutNorCanQueryAUsersPresence() throws Exception {
		// Linus is a real participant elsewhere (with Ada), just not in anything Grace is in.
		client.startDirect(ada.accessToken(), linus.id()).andExpect(status().isCreated());
		var forLinus = listening(linus);

		connected(grace);

		assertThat(forLinus.receivesNothingMatching(e -> "presence.changed".equals(e.path("type").asString()), 1_200))
				.as("linus shares no conversation with grace").isTrue();
		client.presence(linus.accessToken(), conversation).andExpect(status().isNotFound());
		client.presence(linus.accessToken(), UUID.randomUUID().toString()).andExpect(status().isNotFound());
		client.presence("not-a-jwt", conversation).andExpect(status().isUnauthorized());
	}

	@Test
	void presenceReachesEveryoneWhoSharesAnyConversationAndStopsWhenTheyNoLongerDo() throws Exception {
		var group = idOf(client.createGroup(grace.accessToken(), "Pair", linus.id()));
		var forLinus = listening(linus);
		var forAda = listening(ada);

		var first = connected(grace);
		assertThat(forLinus.await(e -> presenceOf(e, grace, true))).isNotNull();
		assertThat(forAda.await(e -> presenceOf(e, grace, true))).isNotNull();
		first.close();
		forLinus.await(e -> presenceOf(e, grace, false));

		client.leave(linus.accessToken(), group).andExpect(status().isNoContent());
		connected(grace);

		assertThat(forAda.await(e -> presenceOf(e, grace, true))).as("ada still shares the direct chat").isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> presenceOf(e, grace, true), 1_200))
				.as("linus left the only shared conversation").isTrue();
	}

	@Test
	void aGroupListsEveryOtherMemberAndNeverTheCaller() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		connected(linus);

		var response = client.presence(grace.accessToken(), group).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2)).andReturn().getResponse().getContentAsString();
		var online = new java.util.HashMap<String, Boolean>();
		json.readTree(response).forEach(p -> online.put(p.get("userId").asString(), p.get("online").asBoolean()));

		assertThat(online).containsOnlyKeys(ada.id(), linus.id());
		assertThat(online.get(linus.id())).isTrue();
		assertThat(online.get(ada.id())).isFalse();
		assertThat(response).doesNotContain("@example.com");
	}

	@Test
	void youDoNotHearAboutYourOwnPresence() throws Exception {
		var forGrace = listening(grace);

		connected(grace);

		assertThat(forGrace.receivesNothingMatching(e -> presenceOf(e, grace, true), 800)).isTrue();
	}

}
