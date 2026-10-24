package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import dev.salman.backend.support.StompTestClient;
import tools.jackson.databind.JsonNode;

/**
 * Ada blocks Grace in their Direct conversation (#57): the Block itself (#58) and the Withheld Messages it makes of
 * what Grace sends while it lasts (#59).
 */
class BlockTests extends RealtimeIntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String withGrace;

	@BeforeEach
	void adaAndGraceTalk() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		withGrace = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private static boolean isBlockChanged(JsonNode event) {
		return "block.changed".equals(event.path("type").asString());
	}

	// ---- blocking and unblocking

	@Test
	void aBlockIsListedAndUnblockingLiftsItAndBothAreIdempotent() throws Exception {
		client.blocks(ada.accessToken()).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.blocks(ada.accessToken())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].userId").value(grace.id()))
				.andExpect(jsonPath("$[0].displayName").value("Grace Hopper"))
				.andExpect(jsonPath("$[0].avatarUrl").doesNotExist())
				.andExpect(jsonPath("$[0].blockedAt").isNotEmpty());

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.blocks(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void theBlockedUsersAreListedNewestFirst() throws Exception {
		var linus = client.account("Linus Torvalds");
		client.startDirect(ada.accessToken(), linus.id()).andExpect(status().is2xxSuccessful());

		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.block(ada.accessToken(), linus.id()).andExpect(status().isNoContent());

		client.blocks(ada.accessToken())
				.andExpect(jsonPath("$[0].userId").value(linus.id()))
				.andExpect(jsonPath("$[1].userId").value(grace.id()));
	}

	@Test
	void aBlockGoesOneWay() throws Exception {
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.blocks(grace.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void onlySomeoneYouShareADirectConversationWithCanBeBlocked() throws Exception {
		var linus = client.account("Linus Torvalds");
		client.createGroup(ada.accessToken(), "Book club", linus.id()).andExpect(status().isCreated());

		for (var target : new Object[] { ada.id(), linus.id(), UUID.randomUUID() }) {
			client.block(ada.accessToken(), target).andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("User not found."));
			client.unblock(ada.accessToken(), target).andExpect(status().isNotFound());
		}
		client.blocks(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	// ---- what each side sees of it

	@Test
	void onlyTheBlockerSeesTheirDirectConversationAsBlocked() throws Exception {
		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.blocked").value(false));

		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.blocked").value(true));
		client.conversations(ada.accessToken()).andExpect(jsonPath("$[0].blocked").value(true));
		client.conversation(grace.accessToken(), withGrace).andExpect(jsonPath("$.blocked").value(false));
		client.conversations(grace.accessToken()).andExpect(jsonPath("$[0].blocked").value(false));

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.blocked").value(false));
	}

	@Test
	void aGroupIsNeverBlocked() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Book club", grace.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.conversation(ada.accessToken(), group).andExpect(jsonPath("$.blocked").value(false));
	}

	@Test
	void blockChangedReachesTheBlockersSessionsOnlyAndOnlyWhenSomethingChanged() throws Exception {
		var phone = listening(ada);
		var laptop = listening(ada);
		var forGrace = listening(grace);

		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		for (var socket : new StompTestClient[] { phone, laptop }) {
			var seen = socket.await(BlockTests::isBlockChanged);
			assertThat(seen.get("userId").asString()).isEqualTo(grace.id());
			assertThat(seen.get("blocked").asBoolean()).isTrue();
		}
		assertThat(forGrace.receivesNothingMatching(BlockTests::isBlockChanged, 800)).isTrue();

		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		assertThat(phone.receivesNothingMatching(BlockTests::isBlockChanged, 800)).isTrue();

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		assertThat(laptop.await(BlockTests::isBlockChanged).get("blocked").asBoolean()).isFalse();
	}

	// ---- the blocker's own actions while the Block lasts

	@Test
	void theBlockerCannotSendReplyEditOrReactButCanTakeBackAReactionHideAndDelete() throws Exception {
		var mine = client.sendNew(ada.accessToken(), withGrace, "Before the Block").get("id").asString();
		var hers = client.sendNew(grace.accessToken(), withGrace, "Also before").get("id").asString();
		client.react(ada.accessToken(), withGrace, hers, "❤️").andExpect(status().isOk());
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.send(ada.accessToken(), withGrace, UUID.randomUUID(), "Hello?").andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("Unblock this person to send Messages."));
		client.sendReply(ada.accessToken(), withGrace, UUID.randomUUID(), "Re", hers).andExpect(status().isConflict());
		var picture = json.readTree(client.uploadImage(ada.accessToken(), "a.png", "image/png",
				UploadImageTests.image("png", 64, 48)).andReturn().getResponse().getContentAsString()).get("id").asString();
		client.sendBody(ada.accessToken(), withGrace, Map.of("clientMessageId", UUID.randomUUID(),
				"attachmentId", picture)).andExpect(status().isConflict());
		client.editMessage(ada.accessToken(), withGrace, mine, "Changed").andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("Unblock this person to change Messages."));
		client.react(ada.accessToken(), withGrace, hers, "👍").andExpect(status().isConflict());

		client.unreact(ada.accessToken(), withGrace, hers).andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions.length()").value(0));
		client.hideMessage(ada.accessToken(), withGrace, hers).andExpect(status().isNoContent());
		client.deleteMessage(ada.accessToken(), withGrace, mine).andExpect(status().isNoContent());

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.send(ada.accessToken(), withGrace, UUID.randomUUID(), "Hello again").andExpect(status().isCreated());
	}

	@Test
	void aBlockDoesNotStopTheBlockerInAGroupTheyShare() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Book club", grace.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.send(ada.accessToken(), group, UUID.randomUUID(), "Still here").andExpect(status().isCreated());
	}

	@Test
	void theBlockedUserIsNotStoppedFromSendingByTheBlock() throws Exception {
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.send(grace.accessToken(), withGrace, UUID.randomUUID(), "Hello?").andExpect(status().isCreated());
	}

	// ---- Withheld Messages (#59)

	/** The Messages {@code who} sees in the Conversation, by body, for the given history query. */
	private List<String> bodiesSeenBy(Account who, String query) throws Exception {
		var page = json.readTree(client.history(who.accessToken(), withGrace, query).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString());
		var bodies = new ArrayList<String>();
		page.get("messages").forEach(m -> bodies.add(m.path("body").asString(null)));
		return bodies;
	}

	private JsonNode read(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private JsonNode messageSeenBy(Account who, String messageId) throws Exception {
		for (var message : read(client.history(who.accessToken(), withGrace, "")).get("messages")) {
			if (message.get("id").asString().equals(messageId)) {
				return message;
			}
		}
		throw new AssertionError("Not in the history: " + messageId);
	}

	@Test
	void aMessageSentWhileBlockedIsAcceptedForTheSenderButNeverShownToTheBlocker() throws Exception {
		client.sendNew(grace.accessToken(), withGrace, "Before the Block");
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		var clientMessageId = UUID.randomUUID();
		var withheld = read(client.send(grace.accessToken(), withGrace, clientMessageId, "Withheld words")
				.andExpect(status().isCreated()).andExpect(jsonPath("$.seq").value(2))
				.andExpect(jsonPath("$.status").value("SENT")));
		client.send(grace.accessToken(), withGrace, clientMessageId, "Withheld words").andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(withheld.get("id").asString()));
		client.sendNew(grace.accessToken(), withGrace, "More withheld words");

		assertThat(bodiesSeenBy(grace, "")).containsExactly("Before the Block", "Withheld words", "More withheld words");
		assertThat(bodiesSeenBy(ada, "")).containsExactly("Before the Block");
		assertThat(bodiesSeenBy(ada, "afterSeq=0")).containsExactly("Before the Block");
		assertThat(bodiesSeenBy(ada, "beforeSeq=10")).containsExactly("Before the Block");
		assertThat(bodiesSeenBy(ada, "aroundSeq=2")).containsExactly("Before the Block");
		client.conversation(ada.accessToken(), withGrace)
				.andExpect(jsonPath("$.lastMessage.body").value("Before the Block"))
				.andExpect(jsonPath("$.unreadCount").value(1));
		client.conversations(ada.accessToken()).andExpect(jsonPath("$[0].lastMessage.body").value("Before the Block"))
				.andExpect(jsonPath("$[0].unreadCount").value(1));
		client.conversation(grace.accessToken(), withGrace)
				.andExpect(jsonPath("$.lastMessage.body").value("More withheld words"));
	}

	@Test
	void neitherSearchFindsAWithheldMessageForTheBlocker() throws Exception {
		client.sendNew(grace.accessToken(), withGrace, "zebra before");
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.sendNew(grace.accessToken(), withGrace, "zebra during");

		client.searchConversation(ada.accessToken(), withGrace, "zebra", null)
				.andExpect(jsonPath("$.results.length()").value(1));
		client.searchAll(ada.accessToken(), "zebra", null).andExpect(jsonPath("$.results.length()").value(1));
		client.searchConversation(grace.accessToken(), withGrace, "zebra", null)
				.andExpect(jsonPath("$.results.length()").value(2));
		client.searchAll(grace.accessToken(), "zebra", null).andExpect(jsonPath("$.results.length()").value(2));
	}

	@Test
	void aWithheldMessageStaysWithheldAfterUnblockWhileNewMessagesFlowAgain() throws Exception {
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var withheld = client.sendNew(grace.accessToken(), withGrace, "Withheld").get("id").asString();
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		var reply = client.sendReply(grace.accessToken(), withGrace, UUID.randomUUID(), "Did you see it?", withheld)
				.andExpect(status().isCreated());
		client.sendNew(ada.accessToken(), withGrace, "Hello again");

		assertThat(bodiesSeenBy(ada, "")).containsExactly("Did you see it?", "Hello again");
		var quote = messageSeenBy(ada, idOf(reply)).get("replyTo");
		assertThat(quote.get("unavailable").asBoolean()).isTrue();
		assertThat(quote.path("text").asString(null)).isNull();
		assertThat(quote.path("senderId").asString(null)).isNull();
		assertThat(messageSeenBy(grace, idOf(reply)).at("/replyTo/text").asString()).isEqualTo("Withheld");
	}

	@Test
	void theBlockerCannotReachAWithheldMessageByItsId() throws Exception {
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var withheld = client.sendNew(grace.accessToken(), withGrace, "Withheld").get("id").asString();
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.react(ada.accessToken(), withGrace, withheld, "👍").andExpect(status().isNotFound());
		client.unreact(ada.accessToken(), withGrace, withheld).andExpect(status().isNotFound());
		client.hideMessage(ada.accessToken(), withGrace, withheld).andExpect(status().isNotFound());
		client.deleteMessage(ada.accessToken(), withGrace, withheld).andExpect(status().isNotFound());
		client.editMessage(ada.accessToken(), withGrace, withheld, "Mine now").andExpect(status().isNotFound());
		client.sendReply(ada.accessToken(), withGrace, UUID.randomUUID(), "What?", withheld)
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Message not found."));
	}

	@Test
	void noEventAboutAWithheldMessageReachesTheBlocker() throws Exception {
		var forAda = listening(ada);
		var gracesOtherTab = listening(grace);
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		var withheld = client.sendNew(grace.accessToken(), withGrace, "Withheld").get("id").asString();
		gracesOtherTab.await(e -> isType(e, "message.created", withGrace));
		client.react(grace.accessToken(), withGrace, withheld, "❤️").andExpect(status().isOk());
		client.deleteMessage(grace.accessToken(), withGrace, withheld).andExpect(status().isNoContent());
		gracesOtherTab.await(e -> isType(e, "message.updated", withGrace));
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.sendNew(grace.accessToken(), withGrace, "After");

		var after = forAda.await(e -> isType(e, "message.created", withGrace));
		assertThat(after.at("/message/body").asString()).isEqualTo("After");
		assertThat(forAda.history()).noneMatch(e -> withheld.equals(e.at("/message/id").asString(null))
				|| withheld.equals(e.path("messageId").asString(null)));
	}

	@Test
	void theBlockerIsNotToldOfReceiptsMovingOntoAWithheldMessage() throws Exception {
		var mine = client.sendNew(ada.accessToken(), withGrace, "Hi").get("seq").asLong();
		client.receipts(grace.accessToken(), withGrace, null, mine).andExpect(status().isOk());
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var forAda = listening(ada);

		var withheld = client.sendNew(grace.accessToken(), withGrace, "Withheld").get("seq").asLong();
		client.receipts(grace.accessToken(), withGrace, withheld, withheld).andExpect(status().isOk());

		assertThat(forAda.receivesNothingMatching(e -> isType(e, "receipts.updated", withGrace), 800)).isTrue();
	}

	@Test
	void noPushForAWithheldMessageReachesTheBlocker() throws Exception {
		client.registerDevice(ada.accessToken(), "ada-phone", "ANDROID").andExpect(status().isCreated());
		var linus = client.account("Linus Torvalds");
		var withLinus = idOf(client.startDirect(linus.accessToken(), ada.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.sendNew(grace.accessToken(), withGrace, "Withheld");
		client.sendNew(linus.accessToken(), withLinus, "The control");

		await().atMost(Duration.ofSeconds(10))
				.until(() -> pushes.all().stream().anyMatch(p -> p.body().equals("The control")));
		Thread.sleep(500); // the two jobs may be handled in either order
		assertThat(pushes.all()).noneMatch(p -> p.body().equals("Withheld"));

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.sendNew(grace.accessToken(), withGrace, "After");
		await().atMost(Duration.ofSeconds(10))
				.until(() -> pushes.all().stream().anyMatch(p -> p.body().equals("After")));
	}

	@Test
	void theBlockersUnreadCountLeavesWithheldMessagesOut() throws Exception {
		var before = client.sendNew(grace.accessToken(), withGrace, "Before").get("seq").asLong();
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.sendNew(grace.accessToken(), withGrace, "Withheld one");
		client.sendNew(grace.accessToken(), withGrace, "Withheld two");
		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.unreadCount").value(1));

		client.receipts(ada.accessToken(), withGrace, null, before).andExpect(status().isOk())
				.andExpect(jsonPath("$.unreadCount").value(0));
		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.unreadCount").value(0));

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var after = client.sendNew(grace.accessToken(), withGrace, "After").get("seq").asLong();
		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.unreadCount").value(1));
		client.receipts(ada.accessToken(), withGrace, null, after).andExpect(jsonPath("$.unreadCount").value(0));
	}

	@Test
	void aWithheldMessageStaysSentForEverAndTheSendersFrontierNeverPassesIt() throws Exception {
		var before = client.sendNew(grace.accessToken(), withGrace, "Before").get("id").asString();
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var withheld = client.sendNew(grace.accessToken(), withGrace, "Withheld");
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var after = client.sendNew(grace.accessToken(), withGrace, "After");
		var forGrace = listening(grace);

		client.receipts(ada.accessToken(), withGrace, null, after.get("seq").asLong()).andExpect(status().isOk());

		var frontier = forGrace.await(e -> isType(e, "receipts.updated", withGrace));
		assertThat(frontier.get("deliveredUpTo").asLong()).isLessThan(withheld.get("seq").asLong());
		assertThat(frontier.get("readUpTo").asLong()).isLessThan(withheld.get("seq").asLong());
		assertThat(messageSeenBy(grace, before).get("status").asString()).isEqualTo("READ");
		assertThat(messageSeenBy(grace, withheld.get("id").asString()).get("status").asString()).isEqualTo("SENT");
		assertThat(messageSeenBy(grace, after.get("id").asString()).get("status").asString()).isEqualTo("READ");
		client.conversation(grace.accessToken(), withGrace).andExpect(jsonPath("$.lastMessage.status").value("READ"));
	}

	@Test
	void aMessageStoredJustBeforeTheBlockIsOrdinary() throws Exception {
		var forAda = listening(ada);
		var before = client.sendNew(grace.accessToken(), withGrace, "Just in time");
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		forAda.await(e -> isType(e, "message.created", withGrace));
		assertThat(bodiesSeenBy(ada, "")).containsExactly("Just in time");
		client.receipts(ada.accessToken(), withGrace, null, before.get("seq").asLong()).andExpect(status().isOk());
		assertThat(messageSeenBy(grace, before.get("id").asString()).get("status").asString()).isEqualTo("READ");
	}

	@Test
	void sendsRacingABlockAreEachUnambiguouslyBeforeOrAfterIt() throws Exception {
		var pool = Executors.newFixedThreadPool(5);
		try {
			var start = new CountDownLatch(1);
			var sends = new ArrayList<Future<Integer>>();
			for (int t = 0; t < 4; t++) {
				var thread = t;
				sends.add(pool.submit(() -> {
					start.await();
					for (int i = 0; i < 5; i++) {
						client.send(grace.accessToken(), withGrace, UUID.randomUUID(), "m" + thread + "-" + i)
								.andExpect(status().isCreated());
					}
					return 5;
				}));
			}
			var block = pool.submit(() -> {
				start.await();
				Thread.sleep(20);
				return client.block(ada.accessToken(), grace.id()).andReturn().getResponse().getStatus();
			});
			start.countDown();
			for (var send : sends) {
				send.get();
			}
			assertThat(block.get()).isEqualTo(204);
		}
		finally {
			pool.shutdownNow();
		}

		var seen = new ArrayList<Long>();
		read(client.history(ada.accessToken(), withGrace, "limit=100")).get("messages")
				.forEach(m -> seen.add(m.get("seq").asLong()));
		// What Ada sees is exactly the Messages stored before the Block: an unbroken run from the first.
		for (int i = 0; i < seen.size(); i++) {
			assertThat(seen.get(i)).isEqualTo(i + 1L);
		}
		assertThat(read(client.history(grace.accessToken(), withGrace, "limit=100")).get("messages").size())
				.isEqualTo(20);
	}

	@Test
	void aBlockDoesNotWithholdMessagesInAGroupTheyShare() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Book club", grace.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.sendNew(grace.accessToken(), group, "In the Group");

		client.history(ada.accessToken(), group, "").andExpect(jsonPath("$.messages[0].body").value("In the Group"));
	}

	// ---- list order (#60)

	private List<String> listOrderOf(Account who) throws Exception {
		var ids = new ArrayList<String>();
		read(client.conversations(who.accessToken())).forEach(c -> ids.add(c.get("id").asString()));
		return ids;
	}

	@Test
	void withheldMessagesDoNotLiftTheConversationInTheBlockersList() throws Exception {
		var linus = client.account("Linus Torvalds");
		var adaWithLinus = idOf(client.startDirect(ada.accessToken(), linus.id()));
		var graceWithLinus = idOf(client.startDirect(grace.accessToken(), linus.id()));
		var seen = client.sendNew(grace.accessToken(), withGrace, "Before the Block");
		client.sendNew(linus.accessToken(), adaWithLinus, "Hello Ada");
		client.sendNew(linus.accessToken(), graceWithLinus, "Hello Grace");
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.sendNew(grace.accessToken(), withGrace, "Withheld");

		assertThat(listOrderOf(ada)).containsExactly(adaWithLinus, withGrace);
		client.conversation(ada.accessToken(), withGrace)
				.andExpect(jsonPath("$.updatedAt").value(seen.get("createdAt").asString()));
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[1].updatedAt").value(seen.get("createdAt").asString()));
		assertThat(listOrderOf(grace)).containsExactly(withGrace, graceWithLinus);
	}

	@Test
	void aConversationWithOnlyWithheldMessagesKeepsItsStartingTimeForTheBlocker() throws Exception {
		var started = read(client.conversation(ada.accessToken(), withGrace)).get("createdAt").asString();
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.sendNew(grace.accessToken(), withGrace, "Withheld");

		client.conversation(ada.accessToken(), withGrace).andExpect(jsonPath("$.updatedAt").value(started));
	}

	@Test
	void afterUnblockANewMessageLiftsTheConversationAgain() throws Exception {
		var linus = client.account("Linus Torvalds");
		var adaWithLinus = idOf(client.startDirect(ada.accessToken(), linus.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		client.sendNew(grace.accessToken(), withGrace, "Withheld");
		client.sendNew(linus.accessToken(), adaWithLinus, "Hello Ada");
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		var after = client.sendNew(grace.accessToken(), withGrace, "After");

		assertThat(listOrderOf(ada)).containsExactly(withGrace, adaWithLinus);
		client.conversation(ada.accessToken(), withGrace)
				.andExpect(jsonPath("$.updatedAt").value(after.get("createdAt").asString()));
	}

	@Test
	void aPinnedConversationStaysFirstForTheBlocker() throws Exception {
		var linus = client.account("Linus Torvalds");
		var adaWithLinus = idOf(client.startDirect(ada.accessToken(), linus.id()));
		client.sendNew(grace.accessToken(), withGrace, "Before the Block");
		client.updateSettings(ada.accessToken(), withGrace, Map.of("pinned", true)).andExpect(status().isOk());
		client.sendNew(linus.accessToken(), adaWithLinus, "Hello Ada");
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.sendNew(grace.accessToken(), withGrace, "Withheld");

		assertThat(listOrderOf(ada)).containsExactly(withGrace, adaWithLinus);
	}

	// ---- the Blocked User's Reactions, edits and typing (#61)

	/** Who reacted to the Message, as {@code who} sees it in their history. */
	private List<String> reactorsSeenBy(Account who, String messageId) throws Exception {
		var reactors = new ArrayList<String>();
		messageSeenBy(who, messageId).get("reactions").forEach(r -> r.get("userIds").forEach(u -> reactors.add(u.asString())));
		return reactors;
	}

	@Test
	void theBlockedUsersReactionsAreHiddenFromTheBlockerWhileTheBlockLastsAndShowAgainAfter() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Book club", grace.id(), linus.id()));
		var inGroup = client.sendNew(ada.accessToken(), group, "In the Group").get("id").asString();
		var before = client.sendNew(ada.accessToken(), withGrace, "Before the Block").get("id").asString();
		client.react(grace.accessToken(), withGrace, before, "❤️").andExpect(status().isOk());
		client.react(ada.accessToken(), withGrace, before, "👍").andExpect(status().isOk());
		client.react(grace.accessToken(), group, inGroup, "❤️").andExpect(status().isOk());
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		client.react(grace.accessToken(), withGrace, before, "😂").andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions.length()").value(2));

		assertThat(reactorsSeenBy(ada, before)).containsExactly(ada.id());
		assertThat(reactorsSeenBy(grace, before)).containsExactlyInAnyOrder(ada.id(), grace.id());
		client.conversation(ada.accessToken(), withGrace)
				.andExpect(jsonPath("$.lastMessage.reactions.length()").value(1))
				.andExpect(jsonPath("$.lastMessage.reactions[0].userIds[0]").value(ada.id()));
		client.unreact(ada.accessToken(), withGrace, before).andExpect(status().isOk())
				.andExpect(jsonPath("$.reactions.length()").value(0));
		client.history(ada.accessToken(), group, "")
				.andExpect(jsonPath("$.messages[0].reactions[0].userIds[0]").value(grace.id()));

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		assertThat(reactorsSeenBy(ada, before)).containsExactly(grace.id());
		client.history(ada.accessToken(), withGrace, "").andExpect(jsonPath("$.messages[0].reactions[0].emoji").value("😂"));
	}

	@Test
	void theBlockedUsersReactionsAndEditsSendNothingToTheBlockerButTheirDeletionsDo() throws Exception {
		var mine = client.sendNew(ada.accessToken(), withGrace, "Mine").get("id").asString();
		var hers = client.sendNew(grace.accessToken(), withGrace, "Hers").get("id").asString();
		var other = client.sendNew(grace.accessToken(), withGrace, "To be deleted").get("id").asString();
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var forAda = listening(ada);
		var gracesOtherTab = listening(grace);

		client.react(grace.accessToken(), withGrace, mine, "❤️").andExpect(status().isOk());
		gracesOtherTab.await(e -> isType(e, "reaction.changed", withGrace));
		client.editMessage(grace.accessToken(), withGrace, hers, "Hers, changed").andExpect(status().isOk());
		gracesOtherTab.await(e -> isType(e, "message.updated", withGrace));
		client.deleteMessage(grace.accessToken(), withGrace, other).andExpect(status().isNoContent());

		var deleted = forAda.await(e -> isType(e, "message.updated", withGrace));
		assertThat(deleted.at("/message/id").asString()).isEqualTo(other);
		assertThat(deleted.at("/message/deletedAt").isMissingNode()).isFalse();
		assertThat(forAda.history()).noneMatch(e -> isType(e, "reaction.changed", withGrace));
		assertThat(forAda.history()).noneMatch(e -> hers.equals(e.at("/message/id").asString(null)));
		assertThat(messageSeenBy(ada, other).path("body").asString(null)).isNull();
		// The known limit (ADR 0004): no earlier text is kept, so the next fetch shows the edit.
		assertThat(messageSeenBy(ada, hers).get("body").asString()).isEqualTo("Hers, changed");
	}

	@Test
	void theBlockedUsersEditsInAGroupStillReachTheBlocker() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Book club", grace.id()));
		var hers = client.sendNew(grace.accessToken(), group, "In the Group").get("id").asString();
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var forAda = listening(ada);

		client.editMessage(grace.accessToken(), group, hers, "In the Group, changed").andExpect(status().isOk());

		assertThat(forAda.await(e -> isType(e, "message.updated", group)).at("/message/body").asString())
				.isEqualTo("In the Group, changed");
	}

	@Test
	void theBlockedUsersTypingDoesNotReachTheBlocker() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Book club", grace.id(), linus.id()));
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var forAda = listening(ada);
		var forGrace = listening(grace);

		forGrace.send("/app/conversations/" + withGrace + "/typing", Map.of("typing", true));
		forGrace.send("/app/conversations/" + group + "/typing", Map.of("typing", true));

		forAda.await(e -> isType(e, "typing.changed", group));
		assertThat(forAda.receivesNothingMatching(e -> isType(e, "typing.changed", withGrace), 500)).isTrue();
		assertThat(forAda.history()).noneMatch(e -> isType(e, "typing.changed", withGrace));

		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		forGrace.send("/app/conversations/" + withGrace + "/typing", Map.of("typing", false));
		forAda.await(e -> isType(e, "typing.changed", withGrace));
	}

	// ---- throttle

	@Test
	void blockChangesAreLimitedButRepeatingTheCurrentStateIsFree() throws Exception {
		for (int i = 0; i < 10; i++) {
			client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
			client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent()); // free: already blocked
			client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		}

		client.block(ada.accessToken(), grace.id()).andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		client.blocks(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent()); // nothing to lift: free
	}

}
