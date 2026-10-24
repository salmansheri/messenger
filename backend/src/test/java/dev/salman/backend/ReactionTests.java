package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;

class ReactionTests extends RealtimeIntegrationTest {

	private static final String THUMBS_UP = "👍";
	private static final String HEART = "❤️";
	private static final String LAUGHING = "😂";
	private static final String SURPRISED = "😮";
	private static final String SAD = "😢";
	private static final String PRAYING = "🙏";

	@Autowired
	JdbcTemplate jdbc;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String conversationId;
	private String message;

	@BeforeEach
	void aConversationWithOneMessage() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		conversationId = idOf(client.startDirect(ada.accessToken(), grace.id()));
		message = client.sendNew(ada.accessToken(), conversationId, "Worth a reaction").get("id").asString();
	}

	// ---- setting, replacing, removing

	@Test
	void aParticipantCanReactWithAnyOfTheSixAndTheReactionIsReturnedWithTheMessage() throws Exception {
		for (var emoji : new String[] { THUMBS_UP, HEART, LAUGHING, SURPRISED, SAD, PRAYING }) {
			client.react(grace.accessToken(), conversationId, message, emoji)
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.id").value(message))
					.andExpect(jsonPath("$.reactions.length()").value(1))
					.andExpect(jsonPath("$.reactions[0].emoji").value(emoji))
					.andExpect(jsonPath("$.reactions[0].userIds[0]").value(grace.id()));
		}

		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].reactions[0].emoji").value(PRAYING))
				.andExpect(jsonPath("$.messages[0].reactions[0].userIds[0]").value(grace.id()));
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.reactions[0].emoji").value(PRAYING));
	}

	@Test
	void aMessageNobodyReactedToHasAnEmptyListOfReactions() throws Exception {
		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].reactions.length()").value(0));
	}

	@Test
	void reactingAgainWithAnotherEmojiReplacesTheReactionSoThereIsOnePerPerson() throws Exception {
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());

		client.react(grace.accessToken(), conversationId, message, HEART)
				.andExpect(jsonPath("$.reactions.length()").value(1))
				.andExpect(jsonPath("$.reactions[0].emoji").value(HEART));

		assertThat(jdbc.queryForObject("select count(*) from reaction where message_id = ?::uuid", Integer.class,
				message)).isEqualTo(1);
	}

	@Test
	void settingTheSameEmojiAgainChangesNothing() throws Exception {
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions[0].emoji").value(THUMBS_UP))
				.andExpect(jsonPath("$.reactions[0].userIds.length()").value(1));
	}

	@Test
	void removingTakesTheReactionAwayAndRemovingWhenThereIsNoneIsHarmless() throws Exception {
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());

		client.unreact(grace.accessToken(), conversationId, message)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions.length()").value(0));
		client.unreact(grace.accessToken(), conversationId, message)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions.length()").value(0));
	}

	@Test
	void peopleWhoChoseTheSameEmojiAreGroupedAndOthersAreSeparate() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var groupMessage = client.sendNew(ada.accessToken(), group, "Group news").get("id").asString();

		client.react(grace.accessToken(), group, groupMessage, THUMBS_UP).andExpect(status().isOk());
		client.react(linus.accessToken(), group, groupMessage, THUMBS_UP).andExpect(status().isOk());
		client.react(ada.accessToken(), group, groupMessage, HEART).andExpect(status().isOk());

		client.history(grace.accessToken(), group, "")
				.andExpect(jsonPath("$.messages[0].reactions.length()").value(2))
				.andExpect(jsonPath("$.messages[0].reactions[?(@.emoji=='" + THUMBS_UP + "')].userIds.length()").value(2))
				.andExpect(jsonPath("$.messages[0].reactions[?(@.emoji=='" + HEART + "')].userIds[0]").value(ada.id()));
	}

	// ---- the set of emoji

	@Test
	void anythingOutsideTheSixIsABadRequest() throws Exception {
		for (var emoji : new String[] { "👎", "a", "", "  ", THUMBS_UP + THUMBS_UP, "thumbs up" }) {
			client.react(grace.accessToken(), conversationId, message, emoji).andExpect(status().isBadRequest());
		}
		assertThat(jdbc.queryForObject("select count(*) from reaction where message_id = ?::uuid", Integer.class,
				message)).isZero();
	}

	@Test
	void theHeartIsAcceptedWithOrWithoutItsVariationSelectorAndStoredOneWay() throws Exception {
		client.react(grace.accessToken(), conversationId, message, "❤")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions[0].emoji").value(HEART));
	}

	// ---- what may be reacted to

	@Test
	void aDeletedMessageCannotBeReactedToAndShowsNoReactions() throws Exception {
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());
		client.deleteMessage(ada.accessToken(), conversationId, message).andExpect(status().isNoContent());

		client.react(grace.accessToken(), conversationId, message, HEART)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("You cannot react to a deleted Message."));
		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].reactions.length()").value(0));
	}

	@Test
	void anUnknownMessageAnotherConversationsMessageAndAnOutsiderAreTheSameNotFound() throws Exception {
		var linus = client.account("Linus Torvalds");
		var elsewhere = idOf(client.startDirect(ada.accessToken(), linus.id()));
		var foreign = client.sendNew(ada.accessToken(), elsewhere, "Elsewhere").get("id").asString();

		client.react(grace.accessToken(), conversationId, UUID.randomUUID().toString(), THUMBS_UP)
				.andExpect(status().isNotFound());
		client.react(grace.accessToken(), conversationId, foreign, THUMBS_UP).andExpect(status().isNotFound());
		client.react(linus.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isNotFound());
		client.unreact(linus.accessToken(), conversationId, message).andExpect(status().isNotFound());
	}

	@Test
	void aMessageFromBeforeTheReactorJoinedCannotBeReactedToAndOneTheyHidCannotEither() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		var early = client.sendNew(ada.accessToken(), group, "Before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());
		var later = client.sendNew(ada.accessToken(), group, "After Linus").get("id").asString();
		client.hideMessage(linus.accessToken(), group, later).andExpect(status().isNoContent());

		client.react(linus.accessToken(), group, early, THUMBS_UP).andExpect(status().isNotFound());
		client.react(linus.accessToken(), group, later, THUMBS_UP).andExpect(status().isNotFound());
	}

	// ---- what reacting does not touch

	@Test
	void reactingChangesNeitherUnreadNorReceiptsNorTheOrderOfTheListNorSendsAPush() throws Exception {
		var linus = client.account("Linus Torvalds");
		var other = idOf(client.startDirect(ada.accessToken(), linus.id()));
		client.sendNew(ada.accessToken(), other, "A newer conversation");
		client.registerDevice(ada.accessToken(), "ada-phone", "ANDROID").andExpect(status().isCreated());
		client.registerDevice(grace.accessToken(), "grace-phone", "ANDROID").andExpect(status().isCreated());
		await().atMost(Duration.ofSeconds(5)).pollDelay(Duration.ofMillis(800)).until(() -> true);
		pushes.clear();

		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());
		Thread.sleep(1200);

		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].id").value(other))
				.andExpect(jsonPath("$[1].id").value(conversationId));
		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].unreadCount").value(1));
		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].status").value("SENT"));
		assertThat(pushes.all()).isEmpty();
	}

	// ---- people who leave

	@Test
	void aParticipantWhoLeavesOrIsRemovedNoLongerAppearsAmongTheReactionsAndComingBackStartsFresh() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var groupMessage = client.sendNew(ada.accessToken(), group, "Group news").get("id").asString();
		client.react(grace.accessToken(), group, groupMessage, THUMBS_UP).andExpect(status().isOk());
		client.react(linus.accessToken(), group, groupMessage, HEART).andExpect(status().isOk());

		client.leave(linus.accessToken(), group).andExpect(status().isNoContent());
		client.history(ada.accessToken(), group, "")
				.andExpect(jsonPath("$.messages[0].reactions.length()").value(1))
				.andExpect(jsonPath("$.messages[0].reactions[0].userIds[0]").value(grace.id()));

		client.removeParticipant(ada.accessToken(), group, grace.id()).andExpect(status().isNoContent());
		client.history(ada.accessToken(), group, "").andExpect(jsonPath("$.messages[0].reactions.length()").value(0));

		client.addParticipant(ada.accessToken(), group, grace.id()).andExpect(status().is2xxSuccessful());
		client.history(ada.accessToken(), group, "").andExpect(jsonPath("$.messages[0].reactions.length()").value(0));
	}

	@Test
	void whenSomeoneWhoReactedLeavesOrIsRemovedTheOthersAreToldSoTheirReactionsDisappearLive() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var groupMessage = client.sendNew(ada.accessToken(), group, "Group news").get("id").asString();
		client.react(linus.accessToken(), group, groupMessage, HEART).andExpect(status().isOk());
		var forAda = listening(ada);
		var forGrace = listening(grace);

		client.leave(linus.accessToken(), group).andExpect(status().isNoContent());

		var told = forAda.await(e -> isType(e, "reactions.cleared", group));
		assertThat(told.get("userId").asString()).isEqualTo(linus.id());
		assertThat(forGrace.await(e -> isType(e, "reactions.cleared", group))).isNotNull();

		// Grace never reacted, so removing her says nothing about reactions.
		client.removeParticipant(ada.accessToken(), group, grace.id()).andExpect(status().isNoContent());
		assertThat(forAda.receivesNothingMatching(e -> isType(e, "reactions.cleared", group), 800)).isTrue();
	}

	// ---- the live event

	@Test
	void everyOneWhoCanReadTheMessageHearsAReactionAndNobodyElseDoes() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		var early = client.sendNew(ada.accessToken(), group, "Before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());
		var forAda = listening(ada);
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		client.react(grace.accessToken(), group, early, THUMBS_UP).andExpect(status().isOk());

		var seenByAda = forAda.await(e -> isType(e, "reaction.changed", group));
		assertThat(seenByAda.get("messageId").asString()).isEqualTo(early);
		assertThat(seenByAda.get("seq").asInt()).isEqualTo(1);
		assertThat(seenByAda.get("userId").asString()).isEqualTo(grace.id());
		assertThat(seenByAda.get("emoji").asString()).isEqualTo(THUMBS_UP);
		assertThat(seenByAda.get("at").asString()).isNotBlank();
		assertThat(forGrace.await(e -> isType(e, "reaction.changed", group))).as("the reactor's other devices").isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> "reaction.changed".equals(e.path("type").asString()), 800))
				.as("joined after the Message").isTrue();
	}

	@Test
	void removingSendsAnEventWithNoEmojiAndChangingNothingSendsNone() throws Exception {
		var forAda = listening(ada);
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());
		forAda.await(e -> isType(e, "reaction.changed", conversationId));

		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());
		client.unreact(grace.accessToken(), conversationId, message).andExpect(status().isOk());
		client.unreact(grace.accessToken(), conversationId, message).andExpect(status().isOk());

		var removed = forAda.await(e -> isType(e, "reaction.changed", conversationId));
		assertThat(removed.get("emoji").isNull()).isTrue();
		assertThat(forAda.receivesNothingMatching(e -> isType(e, "reaction.changed", conversationId), 800)).isTrue();
	}

	@Test
	void anEditOfTheMessageCarriesItsReactionsSoTheyAreNotLostOnScreen() throws Exception {
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());
		var forGrace = listening(grace);

		client.editMessage(ada.accessToken(), conversationId, message, "Worth a reaction, edited")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions[0].emoji").value(THUMBS_UP));

		var seen = forGrace.await(e -> isType(e, "message.updated", conversationId));
		assertThat(seen.get("message").get("reactions").get(0).get("emoji").asString()).isEqualTo(THUMBS_UP);
	}

	// ---- limits

	@Test
	void reactionsShareTheChangeAllowanceOfOneHundredTwentyAMinute() throws Exception {
		for (int i = 1; i <= 120; i++) {
			client.react(grace.accessToken(), conversationId, message, i % 2 == 0 ? THUMBS_UP : HEART)
					.andExpect(status().isOk());
		}

		client.react(grace.accessToken(), conversationId, message, SAD)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		client.unreact(grace.accessToken(), conversationId, message).andExpect(status().isTooManyRequests());
	}

	@Test
	void manyReactionsByOnePersonAtTheSameTimeEndAsExactlyOneWithoutAServerError() throws Exception {
		var emoji = new String[] { THUMBS_UP, HEART, LAUGHING, SURPRISED, SAD, PRAYING };
		var pool = java.util.concurrent.Executors.newFixedThreadPool(6);
		try {
			var start = new java.util.concurrent.CountDownLatch(1);
			var results = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
			for (var one : emoji) {
				results.add(pool.submit(() -> {
					start.await();
					return client.react(grace.accessToken(), conversationId, message, one).andReturn().getResponse()
							.getStatus();
				}));
			}
			start.countDown();
			for (var result : results) {
				assertThat(result.get()).isEqualTo(200);
			}
		}
		finally {
			pool.shutdownNow();
		}

		assertThat(jdbc.queryForObject("select count(*) from reaction where message_id = ?::uuid", Integer.class,
				message)).isEqualTo(1);
	}

	@Test
	void theDatabaseKeepsOneReactionPerPersonPerMessage() throws Exception {
		client.react(grace.accessToken(), conversationId, message, THUMBS_UP).andExpect(status().isOk());

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
				"insert into reaction (id, message_id, conversation_id, user_id, emoji, created_at) "
						+ "select gen_random_uuid(), message_id, conversation_id, user_id, emoji, created_at from reaction"))
				.isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
	}

}
