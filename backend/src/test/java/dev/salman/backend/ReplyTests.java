package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
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

class ReplyTests extends RealtimeIntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String conversationId;

	@BeforeEach
	void aConversationBetweenTwoUsers() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		conversationId = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private String send(Account who, String body) throws Exception {
		return client.sendNew(who.accessToken(), conversationId, body).get("id").asString();
	}

	// ---- sending a reply

	@Test
	void aReplyQuotesTheMessageItAnswersWithItsSenderAndText() throws Exception {
		var question = send(ada, "Are you free at nine?");

		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Yes, I am", question)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.body").value("Yes, I am"))
				.andExpect(jsonPath("$.replyTo.messageId").value(question))
				.andExpect(jsonPath("$.replyTo.senderId").value(ada.id()))
				.andExpect(jsonPath("$.replyTo.text").value("Are you free at nine?"))
				.andExpect(jsonPath("$.replyTo.deleted").value(false))
				.andExpect(jsonPath("$.replyTo.unavailable").value(false));

		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].replyTo").doesNotExist())
				.andExpect(jsonPath("$.messages[1].replyTo.text").value("Are you free at nine?"));
	}

	@Test
	void catchingUpWithAfterSeqAlsoCarriesTheQuote() throws Exception {
		var question = send(ada, "Are you free?");
		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Yes", question)
				.andExpect(status().isCreated());

		client.history(ada.accessToken(), conversationId, "afterSeq=1")
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].replyTo.text").value("Are you free?"));
	}

	@Test
	void aReplyIsOtherwiseAnOrdinaryMessageForOrderUnreadAndPush() throws Exception {
		var question = send(ada, "Question");
		client.registerDevice(ada.accessToken(), "ada-phone", "ANDROID").andExpect(status().isCreated());

		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Answer", question)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.seq").value(2))
				.andExpect(jsonPath("$.status").value("SENT"));

		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].unreadCount").value(1))
				.andExpect(jsonPath("$[0].lastMessage.body").value("Answer"))
				.andExpect(jsonPath("$[0].lastMessage.replyTo.text").value("Question"));
		org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 1);
		assertThat(pushes.all().getFirst().body()).isEqualTo("Answer");
	}

	@Test
	void aLongQuotedTextIsCutToTheFirstHundredCharacters() throws Exception {
		var long400 = "x".repeat(150);
		var quoted = send(ada, long400);

		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Long", quoted)
				.andExpect(jsonPath("$.replyTo.text").value("x".repeat(100) + "…"));
	}

	@Test
	void youCanReplyToYourOwnMessageAndToAReplyButTheQuoteGoesOneLevelOnly() throws Exception {
		var first = send(ada, "First");
		var reply = json.readTree(client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(),
				"Second", first).andReturn().getResponse().getContentAsString()).get("id").asString();

		client.sendReply(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Third", reply)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.replyTo.text").value("Second"))
				.andExpect(jsonPath("$.replyTo.replyTo").doesNotExist());
		client.sendReply(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "To myself", first)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.replyTo.senderId").value(ada.id()));
	}

	// ---- what the quote shows later

	@Test
	void theQuoteShowsTheCurrentTextAfterAnEditAndADeletedMarkerAfterADeletion() throws Exception {
		var quoted = send(ada, "Helo");
		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Reply", quoted)
				.andExpect(status().isCreated());

		client.editMessage(ada.accessToken(), conversationId, quoted, "Hello").andExpect(status().isOk());
		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[1].replyTo.text").value("Hello"));

		client.deleteMessage(ada.accessToken(), conversationId, quoted).andExpect(status().isNoContent());
		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[1].replyTo.deleted").value(true))
				.andExpect(jsonPath("$.messages[1].replyTo.text").doesNotExist())
				.andExpect(jsonPath("$.messages[1].replyTo.messageId").value(quoted));
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.replyTo.deleted").value(true));
	}

	@Test
	void editingAReplyKeepsItsQuoteAndDeletingItLeavesNoQuote() throws Exception {
		var quoted = send(ada, "Context");
		var reply = json.readTree(client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(),
				"Typo", quoted).andReturn().getResponse().getContentAsString()).get("id").asString();

		client.editMessage(grace.accessToken(), conversationId, reply, "Fixed")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.replyTo.text").value("Context"));
		client.deleteMessage(grace.accessToken(), conversationId, reply).andExpect(status().isNoContent());

		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[1].deletedAt").isNotEmpty())
				.andExpect(jsonPath("$.messages[1].replyTo").doesNotExist());
	}

	// ---- what may be quoted

	@Test
	void anUnknownMessageOrOneFromAnotherConversationIsTheSameNotFound() throws Exception {
		var other = client.account("Linus Torvalds");
		var elsewhere = idOf(client.startDirect(ada.accessToken(), other.id()));
		var foreign = client.sendNew(ada.accessToken(), elsewhere, "Somewhere else").get("id").asString();

		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Reply", foreign)
				.andExpect(status().isNotFound());
		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Reply",
				UUID.randomUUID().toString()).andExpect(status().isNotFound());
		client.history(grace.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(0));
	}

	@Test
	void aMessageFromBeforeTheReplierJoinedCannotBeQuotedByThem() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		var early = client.sendNew(ada.accessToken(), group, "Before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());

		client.sendReply(linus.accessToken(), group, UUID.randomUUID().toString(), "Reply", early)
				.andExpect(status().isNotFound());
	}

	@Test
	void aNonParticipantGetsTheUniformNotFoundWhateverTheyQuote() throws Exception {
		var outsider = client.account("Linus Torvalds");
		var quoted = send(ada, "Private");

		client.sendReply(outsider.accessToken(), conversationId, UUID.randomUUID().toString(), "Hi", quoted)
				.andExpect(status().isNotFound());
	}

	@Test
	void aDeletedMessageCannotBeRepliedTo() throws Exception {
		var quoted = send(ada, "Gone soon");
		client.deleteMessage(ada.accessToken(), conversationId, quoted).andExpect(status().isNoContent());

		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Too late", quoted)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("You cannot reply to a deleted Message."));
	}

	@Test
	void aMessageTheReplierHidThemselvesCannotBeQuotedByThem() throws Exception {
		var quoted = send(ada, "Hidden by Grace");
		client.hideMessage(grace.accessToken(), conversationId, quoted).andExpect(status().isNoContent());

		client.sendReply(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Answering", quoted)
				.andExpect(status().isNotFound());
	}

	@Test
	void aMessageSomeoneHidForThemselvesIsUnavailableInOtherPeoplesQuotesOfItToThemButNotToOthers() throws Exception {
		var quoted = send(ada, "Hidden by Grace");
		client.hideMessage(grace.accessToken(), conversationId, quoted).andExpect(status().isNoContent());
		var forGrace = listening(grace);

		client.sendReply(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Ada answers herself", quoted)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.replyTo.text").value("Hidden by Grace"));

		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].replyTo.unavailable").value(true))
				.andExpect(jsonPath("$.messages[0].replyTo.text").doesNotExist());
		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.replyTo.unavailable").value(true));
		var seen = forGrace.await(e -> isType(e, "message.created", conversationId));
		assertThat(seen.get("message").get("replyTo").get("unavailable").asBoolean()).isTrue();
		assertThat(seen.toString()).doesNotContain("Hidden by Grace");
		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[1].replyTo.text").value("Hidden by Grace"));
	}

	// ---- the join point and the quote

	@Test
	void someoneWhoJoinedAfterTheQuotedMessageSeesItAsUnavailableNotItsText() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		var early = client.sendNew(ada.accessToken(), group, "Secret from before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());
		client.sendReply(grace.accessToken(), group, UUID.randomUUID().toString(), "Answering the early one", early)
				.andExpect(status().isCreated());

		client.history(linus.accessToken(), group, "")
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].body").value("Answering the early one"))
				.andExpect(jsonPath("$.messages[0].replyTo.unavailable").value(true))
				.andExpect(jsonPath("$.messages[0].replyTo.text").doesNotExist())
				.andExpect(jsonPath("$.messages[0].replyTo.senderId").doesNotExist());
		client.conversations(linus.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.replyTo.unavailable").value(true));
		client.history(ada.accessToken(), group, "")
				.andExpect(jsonPath("$.messages[1].replyTo.text").value("Secret from before Linus"));
	}

	@Test
	void theLiveEventAlsoKeepsTheQuotedTextFromSomeoneWhoJoinedLater() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		var early = client.sendNew(ada.accessToken(), group, "Secret from before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());
		var forLinus = listening(linus);
		var forAda = listening(ada);

		client.sendReply(grace.accessToken(), group, UUID.randomUUID().toString(), "Answering the early one", early)
				.andExpect(status().isCreated());

		var seenByLinus = forLinus.await(e -> isType(e, "message.created", group));
		assertThat(seenByLinus.get("message").get("replyTo").get("unavailable").asBoolean()).isTrue();
		assertThat(seenByLinus.toString()).doesNotContain("Secret from before Linus");
		var seenByAda = forAda.await(e -> isType(e, "message.created", group));
		assertThat(seenByAda.get("message").get("replyTo").get("text").asString()).isEqualTo("Secret from before Linus");
	}

	// ---- retries

	@Test
	void retryingAReplyWithTheSameClientMessageIdIsTheSameMessageAndADifferentTargetIsAConflict() throws Exception {
		var one = send(ada, "One");
		var two = send(ada, "Two");
		var clientMessageId = UUID.randomUUID().toString();
		var created = json.readTree(client.sendReply(grace.accessToken(), conversationId, clientMessageId, "Reply", one)
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

		client.sendReply(grace.accessToken(), conversationId, clientMessageId, "Reply", one)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(created.get("id").asString()))
				.andExpect(jsonPath("$.replyTo.text").value("One"));
		client.sendReply(grace.accessToken(), conversationId, clientMessageId, "Reply", two)
				.andExpect(status().isConflict());
		client.send(grace.accessToken(), conversationId, clientMessageId, "Reply").andExpect(status().isConflict());
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(3));
	}

	@Test
	void aRetryOfAReplyWhoseQuotedMessageWasDeletedMeanwhileStillAnswersWithTheStoredMessage() throws Exception {
		var quoted = send(ada, "Soon gone");
		var clientMessageId = UUID.randomUUID().toString();
		client.sendReply(grace.accessToken(), conversationId, clientMessageId, "Reply", quoted)
				.andExpect(status().isCreated());
		client.deleteMessage(ada.accessToken(), conversationId, quoted).andExpect(status().isNoContent());

		client.sendReply(grace.accessToken(), conversationId, clientMessageId, "Reply", quoted)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.replyTo.deleted").value(true));
	}

	// ---- housekeeping

	@Test
	void aGroupWhoseLastParticipantLeavesIsRemovedEvenWhenItHoldsReplies() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Short lived", grace.id()));
		var first = client.sendNew(ada.accessToken(), group, "Start").get("id").asString();
		client.sendReply(grace.accessToken(), group, UUID.randomUUID().toString(), "Reply", first)
				.andExpect(status().isCreated());

		client.leave(grace.accessToken(), group).andExpect(status().isNoContent());
		client.leave(ada.accessToken(), group).andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from message where conversation_id = ?::uuid", Integer.class,
				group)).isZero();
	}

	@Test
	void theDatabaseItselfRefusesAReplyToAMessageOfAnotherConversation() throws Exception {
		var other = client.account("Linus Torvalds");
		var elsewhere = idOf(client.startDirect(ada.accessToken(), other.id()));
		var foreign = client.sendNew(ada.accessToken(), elsewhere, "Elsewhere").get("id").asString();
		var mine = send(ada, "Here");

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
				"update message set reply_to_id = ?::uuid where id = ?::uuid", foreign, mine))
				.isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
	}

}
