package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import dev.salman.backend.support.IntegrationTest;

class EditDeleteMessageTests extends IntegrationTest {

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
		var started = client.startDirect(ada.accessToken(), grace.id()).andReturn().getResponse().getContentAsString();
		conversationId = json.readTree(started).get("id").asString();
	}

	private String send(Account who, String body) throws Exception {
		return client.sendNew(who.accessToken(), conversationId, body).get("id").asString();
	}

	/** A fresh access token after the clock has moved, because tokens last only 15 minutes. */
	private String tokenOf(Account who) throws Exception {
		return client.loginForTokens(who.email(), AuthClient.PASSWORD).accessToken();
	}

	// ---- editing

	@Test
	void theSenderCanEditTheTextWithinFifteenMinutesAndItIsMarkedEditedInPlace() throws Exception {
		var id = send(ada, "Helo");
		clock.advance(Duration.ofMinutes(14));

		client.editMessage(tokenOf(ada), conversationId, id, "Hello")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(jsonPath("$.seq").value(1))
				.andExpect(jsonPath("$.body").value("Hello"))
				.andExpect(jsonPath("$.editedAt").isNotEmpty())
				.andExpect(jsonPath("$.status").value("SENT"));

		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].body").value("Hello"))
				.andExpect(jsonPath("$.messages[0].editedAt").isNotEmpty());
		assertThat(id).isNotBlank();
		assertThat(UUID.fromString(id)).isNotNull();
	}

	@Test
	void anEditAfterFifteenMinutesIsRefusedAndTheTextStays() throws Exception {
		var id = send(ada, "Original");
		clock.advance(Duration.ofMinutes(16));

		client.editMessage(tokenOf(ada), conversationId, id, "Too late")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("A Message can only be edited for 15 minutes after it is sent."));

		client.history(tokenOf(grace), conversationId, "")
				.andExpect(jsonPath("$.messages[0].body").value("Original"))
				.andExpect(jsonPath("$.messages[0].editedAt").doesNotExist());
	}

	@Test
	void onlyTheSenderMayEditEvenInADirectConversation() throws Exception {
		var id = send(ada, "Mine");

		client.editMessage(grace.accessToken(), conversationId, id, "Hijacked").andExpect(status().isForbidden());

		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages[0].body").value("Mine"));
	}

	@Test
	void anOutsiderAndAnUnknownOrForeignMessageGetTheSameNotFound() throws Exception {
		var id = send(ada, "Mine");
		var outsider = client.account("Linus Torvalds");
		var other = client.startDirect(ada.accessToken(), outsider.id()).andReturn().getResponse().getContentAsString();
		var otherConversation = json.readTree(other).get("id").asString();

		client.editMessage(outsider.accessToken(), conversationId, id, "Hi").andExpect(status().isNotFound());
		client.editMessage(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Hi")
				.andExpect(status().isNotFound());
		client.editMessage(ada.accessToken(), otherConversation, id, "Hi").andExpect(status().isNotFound());
	}

	@Test
	void anEditFollowsTheSameTextRulesAsSending() throws Exception {
		var id = send(ada, "Fine");

		client.editMessage(ada.accessToken(), conversationId, id, "   ").andExpect(status().isBadRequest());
		client.editMessage(ada.accessToken(), conversationId, id, "x".repeat(4001)).andExpect(status().isBadRequest());
		client.editMessage(ada.accessToken(), conversationId, id, "NUL \u0000 inside")
				.andExpect(status().isBadRequest());
	}

	@Test
	void savingTheSameTextChangesNothingAndDoesNotMarkItEdited() throws Exception {
		var id = send(ada, "Same");

		client.editMessage(ada.accessToken(), conversationId, id, "Same")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.body").value("Same"))
				.andExpect(jsonPath("$.editedAt").doesNotExist());
	}

	@Test
	void anEditChangesNeitherReceiptsNorUnreadNorTheOrderOfTheList() throws Exception {
		var first = send(ada, "Edit me");
		var other = client.account("Linus Torvalds");
		var second = json.readTree(client.startDirect(ada.accessToken(), other.id()).andReturn().getResponse()
				.getContentAsString()).get("id").asString();
		client.sendNew(ada.accessToken(), second, "Newer conversation");
		client.conversations(ada.accessToken()).andExpect(jsonPath("$[0].id").value(second));

		client.editMessage(ada.accessToken(), conversationId, first, "Edited").andExpect(status().isOk());

		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].id").value(conversationId))
				.andExpect(jsonPath("$[0].unreadCount").value(1))
				.andExpect(jsonPath("$[0].lastMessage.body").value("Edited"));
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].id").value(second))
				.andExpect(jsonPath("$[1].id").value(conversationId));
		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].seq").value(1))
				.andExpect(jsonPath("$.messages[0].status").value("SENT"));
	}

	// ---- deleting for everyone

	@Test
	void theSenderCanDeleteForEveryoneAndTheMessageStaysAsAPlaceholderInItsPlace() throws Exception {
		send(ada, "Before");
		var id = send(ada, "Secret plans");
		send(grace, "After");
		clock.advance(Duration.ofMinutes(59));

		client.deleteMessage(tokenOf(ada), conversationId, id).andExpect(status().isNoContent());

		client.history(tokenOf(grace), conversationId, "")
				.andExpect(jsonPath("$.messages.length()").value(3))
				.andExpect(jsonPath("$.messages[1].id").value(id))
				.andExpect(jsonPath("$.messages[1].seq").value(2))
				.andExpect(jsonPath("$.messages[1].senderId").value(ada.id()))
				.andExpect(jsonPath("$.messages[1].body").doesNotExist())
				.andExpect(jsonPath("$.messages[1].deletedAt").isNotEmpty());
		assertThat(jdbc.queryForObject("select body from message where id = ?::uuid", String.class, id)).isNull();
	}

	@Test
	void aDeleteForEveryoneAfterAnHourIsRefusedAndTheMessageStays() throws Exception {
		var id = send(ada, "Old news");
		clock.advance(Duration.ofMinutes(61));

		client.deleteMessage(tokenOf(ada), conversationId, id)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail")
						.value("A Message can only be deleted for everyone for 60 minutes after it is sent."));

		client.history(tokenOf(grace), conversationId, "").andExpect(jsonPath("$.messages[0].body").value("Old news"));
	}

	@Test
	void onlyTheSenderMayDeleteForEveryoneAndAnOutsiderSeesNotFound() throws Exception {
		var id = send(ada, "Mine");
		var outsider = client.account("Linus Torvalds");

		client.deleteMessage(grace.accessToken(), conversationId, id).andExpect(status().isForbidden());
		client.deleteMessage(outsider.accessToken(), conversationId, id).andExpect(status().isNotFound());

		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages[0].body").value("Mine"));
	}

	@Test
	void deletingAgainChangesNothingAndStillAnswersNoContent() throws Exception {
		var id = send(ada, "Gone");
		client.deleteMessage(ada.accessToken(), conversationId, id).andExpect(status().isNoContent());
		var deletedAt = jdbc.queryForObject("select deleted_at from message where id = ?::uuid", java.sql.Timestamp.class,
				id);
		clock.advance(Duration.ofHours(3));

		client.deleteMessage(tokenOf(ada), conversationId, id).andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select deleted_at from message where id = ?::uuid", java.sql.Timestamp.class,
				id)).isEqualTo(deletedAt);
	}

	@Test
	void aDeletedMessageCannotBeEdited() throws Exception {
		var id = send(ada, "Gone");
		client.deleteMessage(ada.accessToken(), conversationId, id).andExpect(status().isNoContent());

		client.editMessage(ada.accessToken(), conversationId, id, "Revived").andExpect(status().isConflict());

		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages[0].body").doesNotExist());
	}

	@Test
	void theListShowsAPlaceholderWithoutTheTextWhenTheLatestMessageWasDeleted() throws Exception {
		send(ada, "First");
		var latest = send(ada, "Leaky secret");

		client.deleteMessage(ada.accessToken(), conversationId, latest).andExpect(status().isNoContent());

		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.id").value(latest))
				.andExpect(jsonPath("$[0].lastMessage.body").doesNotExist())
				.andExpect(jsonPath("$[0].lastMessage.deletedAt").isNotEmpty())
				.andExpect(jsonPath("$[0].unreadCount").value(2));
	}

	@Test
	void retryingTheSendOfADeletedMessageAnswersWithThePlaceholderNotAnError() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();
		var created = json.readTree(client.send(ada.accessToken(), conversationId, clientMessageId, "Oops")
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
		client.deleteMessage(ada.accessToken(), conversationId, created.get("id").asString())
				.andExpect(status().isNoContent());

		client.send(ada.accessToken(), conversationId, clientMessageId, "Oops")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(created.get("id").asString()))
				.andExpect(jsonPath("$.body").doesNotExist())
				.andExpect(jsonPath("$.deletedAt").isNotEmpty());
	}

	@Test
	void retryingTheSendOfAnEditedMessageAnswersWithTheStoredMessage() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();
		var created = json.readTree(client.send(ada.accessToken(), conversationId, clientMessageId, "Helo")
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
		client.editMessage(ada.accessToken(), conversationId, created.get("id").asString(), "Hello")
				.andExpect(status().isOk());

		client.send(ada.accessToken(), conversationId, clientMessageId, "Helo")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.body").value("Hello"));
	}

	// ---- deleting for me

	@Test
	void hidingAMessageRemovesItFromTheViewersHistoryOnlyAndItStaysHidden() throws Exception {
		send(ada, "One");
		var two = send(ada, "Two");
		send(ada, "Three");

		client.hideMessage(grace.accessToken(), conversationId, two).andExpect(status().isNoContent());

		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages.length()").value(2))
				.andExpect(jsonPath("$.messages[0].seq").value(1))
				.andExpect(jsonPath("$.messages[1].seq").value(3));
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(3));
		client.history(grace.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(2));
	}

	@Test
	void hiddenMessagesAreSkippedWhenPagingBackAndCatchingUpWithoutShorteningPages() throws Exception {
		var ids = new java.util.ArrayList<String>();
		for (int i = 1; i <= 6; i++) {
			ids.add(send(ada, "Message " + i));
		}
		client.hideMessage(grace.accessToken(), conversationId, ids.get(3)).andExpect(status().isNoContent());
		client.hideMessage(grace.accessToken(), conversationId, ids.get(4)).andExpect(status().isNoContent());

		client.history(grace.accessToken(), conversationId, "limit=2")
				.andExpect(jsonPath("$.messages.length()").value(2))
				.andExpect(jsonPath("$.messages[0].seq").value(3))
				.andExpect(jsonPath("$.messages[1].seq").value(6))
				.andExpect(jsonPath("$.hasMore").value(true));
		client.history(grace.accessToken(), conversationId, "beforeSeq=6&limit=2")
				.andExpect(jsonPath("$.messages.length()").value(2))
				.andExpect(jsonPath("$.messages[0].seq").value(2))
				.andExpect(jsonPath("$.messages[1].seq").value(3));
		client.history(grace.accessToken(), conversationId, "afterSeq=3")
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].seq").value(6));
	}

	@Test
	void anyParticipantMayHideAnyMessageIncludingTheirOwnAndHidingTwiceIsHarmless() throws Exception {
		var mine = send(grace, "My own");

		client.hideMessage(grace.accessToken(), conversationId, mine).andExpect(status().isNoContent());
		client.hideMessage(grace.accessToken(), conversationId, mine).andExpect(status().isNoContent());

		client.history(grace.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(0));
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(1));
	}

	@Test
	void hidingIsNotLimitedByTheTimeWindowsAndNeedsToBeAParticipantWhoCanReadIt() throws Exception {
		var id = send(ada, "Old");
		var outsider = client.account("Linus Torvalds");
		clock.advance(Duration.ofDays(2));

		client.hideMessage(tokenOf(grace), conversationId, id).andExpect(status().isNoContent());
		client.hideMessage(tokenOf(outsider), conversationId, id).andExpect(status().isNotFound());
		client.hideMessage(tokenOf(grace), conversationId, UUID.randomUUID().toString())
				.andExpect(status().isNotFound());
	}

	@Test
	void theListFallsBackToTheLatestMessageTheViewerHasNotHiddenAndThenToNone() throws Exception {
		var first = send(ada, "First");
		var second = send(ada, "Second");

		client.hideMessage(grace.accessToken(), conversationId, second).andExpect(status().isNoContent());
		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.id").value(first))
				.andExpect(jsonPath("$[0].unreadCount").value(2));
		client.conversations(ada.accessToken()).andExpect(jsonPath("$[0].lastMessage.id").value(second));

		client.hideMessage(grace.accessToken(), conversationId, first).andExpect(status().isNoContent());
		client.conversations(grace.accessToken()).andExpect(jsonPath("$[0].lastMessage").doesNotExist());
	}

	@Test
	void hidingMakesNoEventAndLeavesTheSendersViewAlone() throws Exception {
		var id = send(ada, "Seen by Grace");

		client.hideMessage(grace.accessToken(), conversationId, id).andExpect(status().isNoContent());

		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].body").value("Seen by Grace"))
				.andExpect(jsonPath("$.messages[0].deletedAt").doesNotExist());
	}

	// ---- limits and membership

	@Test
	void editsDeletesAndHidesShareTheChangeAllowanceOfOneHundredTwentyAMinute() throws Exception {
		var id = send(ada, "Version 0");
		for (int i = 1; i <= 120; i++) {
			client.editMessage(ada.accessToken(), conversationId, id, "Version " + i).andExpect(status().isOk());
		}

		client.editMessage(ada.accessToken(), conversationId, id, "One too many")
				.andExpect(status().isTooManyRequests())
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
						.exists("Retry-After"));
		client.deleteMessage(ada.accessToken(), conversationId, id).andExpect(status().isTooManyRequests());
		client.hideMessage(ada.accessToken(), conversationId, id).andExpect(status().isTooManyRequests());
		client.sendNew(ada.accessToken(), conversationId, "Sending is a separate allowance");
	}

	@Test
	void aSenderWhoWasRemovedFromAGroupCanNoLongerChangeTheirOldMessages() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = json.readTree(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()).andReturn()
				.getResponse().getContentAsString()).get("id").asString();
		var message = client.sendNew(grace.accessToken(), group, "Mine").get("id").asString();
		client.removeParticipant(ada.accessToken(), group, grace.id()).andExpect(status().isNoContent());

		client.editMessage(grace.accessToken(), group, message, "Edited").andExpect(status().isNotFound());
		client.deleteMessage(grace.accessToken(), group, message).andExpect(status().isNotFound());
		client.hideMessage(grace.accessToken(), group, message).andExpect(status().isNotFound());

		client.history(ada.accessToken(), group, "").andExpect(jsonPath("$.messages[0].body").value("Mine"));
	}

	@Test
	void aMessageFromBeforeAParticipantJoinedCannotBeTouchedByThem() throws Exception {
		var linus = client.account("Linus Torvalds");
		var group = json.readTree(client.createGroup(ada.accessToken(), "Duo", grace.id()).andReturn().getResponse()
				.getContentAsString()).get("id").asString();
		var early = client.sendNew(ada.accessToken(), group, "Before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());

		client.hideMessage(linus.accessToken(), group, early).andExpect(status().isNotFound());
		client.deleteMessage(linus.accessToken(), group, early).andExpect(status().isNotFound());
	}

}
