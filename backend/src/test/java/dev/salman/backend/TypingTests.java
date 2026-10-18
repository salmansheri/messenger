package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import tools.jackson.databind.JsonNode;

class TypingTests extends RealtimeIntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

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

	private String typingDestination() {
		return "/app/conversations/" + conversation + "/typing";
	}

	private static boolean typing(JsonNode event, Account who, boolean typing) {
		return "typing.changed".equals(event.path("type").asString()) && who.id().equals(event.path("userId").asString())
				&& event.path("typing").asBoolean() == typing;
	}

	@Test
	void typingReachesTheOtherParticipantsLiveAndNobodyElse() throws Exception {
		var forAda = listening(ada);
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		forGrace.send(typingDestination(), Map.of("typing", true));

		var event = forAda.await(e -> typing(e, grace, true));
		assertThat(event.get("conversationId").asString()).isEqualTo(conversation);
		assertThat(forGrace.receivesNothingMatching(e -> "typing.changed".equals(e.path("type").asString()), 800))
				.as("not echoed to the typist").isTrue();
		assertThat(forLinus.receivesNothingMatching(e -> "typing.changed".equals(e.path("type").asString()), 500))
				.as("linus is not in the conversation").isTrue();
	}

	@Test
	void stoppingIsReportedToo() throws Exception {
		var forAda = listening(ada);
		var forGrace = listening(grace);

		forGrace.send(typingDestination(), Map.of("typing", true));
		forAda.await(e -> typing(e, grace, true));
		forGrace.send(typingDestination(), Map.of("typing", false));

		assertThat(forAda.await(e -> typing(e, grace, false))).isNotNull();
	}

	@Test
	void inAGroupEveryOtherCurrentMemberHearsAndAFormerMemberDoesNot() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var forAda = listening(ada);
		var forLinus = listening(linus);
		var forGrace = listening(grace);

		forGrace.send("/app/conversations/" + group + "/typing", Map.of("typing", true));
		assertThat(forAda.await(e -> typing(e, grace, true))).isNotNull();
		assertThat(forLinus.await(e -> typing(e, grace, true))).isNotNull();

		client.removeParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isNoContent());
		forLinus.await(e -> "conversation.changed".equals(e.path("type").asString()));
		forGrace.send("/app/conversations/" + group + "/typing", Map.of("typing", false));

		assertThat(forAda.await(e -> typing(e, grace, false))).isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> typing(e, grace, false), 800)).isTrue();
	}

	@Test
	void typingIsNeverStored() throws Exception {
		var forGrace = listening(grace);
		var forAda = listening(ada);
		var updatedBefore = jdbc.queryForObject("select updated_at from conversation where id = ?",
				java.sql.Timestamp.class, UUID.fromString(conversation));

		for (int i = 0; i < 5; i++) {
			forGrace.send(typingDestination(), Map.of("typing", i % 2 == 0));
		}
		forAda.await(e -> "typing.changed".equals(e.path("type").asString()));

		assertThat(jdbc.queryForObject("select count(*) from message where conversation_id = ?", Long.class,
				UUID.fromString(conversation))).isZero();
		assertThat(jdbc.queryForObject("select updated_at from conversation where id = ?", java.sql.Timestamp.class,
				UUID.fromString(conversation))).isEqualTo(updatedBefore);
		assertThat(jdbc.queryForObject("select last_seq from conversation where id = ?", Long.class,
				UUID.fromString(conversation))).isZero();
		client.conversations(ada.accessToken()).andExpect(jsonPath("$[0].unreadCount").value(0))
				.andExpect(jsonPath("$[0].lastMessage").doesNotExist());
	}

	@Test
	void aNonParticipantCannotSendTypingAndGetsAnErrorBack() throws Exception {
		var forLinus = listening(linus);
		var forAda = listening(ada);

		forLinus.send(typingDestination(), Map.of("typing", true));

		var error = forLinus.await(e -> "error".equals(e.path("type").asString()));
		assertThat(error.get("status").asInt()).isEqualTo(404);
		assertThat(forAda.receivesNothingMatching(e -> "typing.changed".equals(e.path("type").asString()), 600))
				.isTrue();
	}

	@Test
	void anInvalidTypingMessageComesBackAsAnError() throws Exception {
		var forGrace = listening(grace);

		forGrace.send(typingDestination(), Map.of());

		assertThat(forGrace.await(e -> "error".equals(e.path("type").asString())).get("status").asInt())
				.isEqualTo(400);
	}

	@Test
	void aFloodOfTypingMessagesIsThrottledQuietly() throws Exception {
		var forAda = listening(ada);
		var forGrace = listening(grace);

		for (int i = 0; i < 40; i++) {
			forGrace.send(typingDestination(), Map.of("typing", true));
		}

		forAda.await(e -> typing(e, grace, true));
		var delivered = 1;
		while (!forAda.receivesNothingMatching(e -> typing(e, grace, true), 800)) {
			delivered++;
		}
		assertThat(delivered).isBetween(1, 10);
		assertThat(forGrace.receivesNothingMatching(e -> "error".equals(e.path("type").asString()), 500))
				.as("excess is dropped without an error").isTrue();
	}

}
