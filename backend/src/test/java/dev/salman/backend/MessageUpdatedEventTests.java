package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;

class MessageUpdatedEventTests extends RealtimeIntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;

	@BeforeEach
	void accounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
	}

	private static boolean isUpdate(tools.jackson.databind.JsonNode event, String conversation) {
		return isType(event, "message.updated", conversation);
	}

	@Test
	void anEditReachesEveryCurrentParticipantWithTheNewTextAndNobodyElse() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var message = client.sendNew(ada.accessToken(), conversation, "Helo").get("id").asString();
		var forAda = listening(ada);
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		client.editMessage(ada.accessToken(), conversation, message, "Hello").andExpect(status().isOk());

		var seen = forGrace.await(e -> isUpdate(e, conversation));
		assertThat(seen.get("message").get("id").asString()).isEqualTo(message);
		assertThat(seen.get("message").get("body").asString()).isEqualTo("Hello");
		assertThat(seen.get("message").get("seq").asInt()).isEqualTo(1);
		assertThat(seen.get("message").get("editedAt").asString()).isNotBlank();
		assertThat(seen.get("message").path("status").isNull()).as("no sender-only status").isTrue();
		assertThat(forAda.await(e -> isUpdate(e, conversation))).isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> "message.updated".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void aDeletionReachesTheParticipantsAsAPlaceholderWithNoText() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var message = client.sendNew(ada.accessToken(), conversation, "Secret").get("id").asString();
		var forGrace = listening(grace);

		client.deleteMessage(ada.accessToken(), conversation, message).andExpect(status().isNoContent());

		var seen = forGrace.await(e -> isUpdate(e, conversation));
		assertThat(seen.get("message").get("id").asString()).isEqualTo(message);
		assertThat(seen.get("message").get("deletedAt").asString()).isNotBlank();
		assertThat(seen.toString()).doesNotContain("Secret");
	}

	@Test
	void anEditThatChangesNothingAndAHideMakeNoEvent() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var message = client.sendNew(ada.accessToken(), conversation, "Same").get("id").asString();
		var forAda = listening(ada);
		var forGrace = listening(grace);

		client.editMessage(ada.accessToken(), conversation, message, "Same").andExpect(status().isOk());
		client.hideMessage(grace.accessToken(), conversation, message).andExpect(status().isNoContent());
		client.deleteMessage(ada.accessToken(), conversation, message).andExpect(status().isNoContent());

		// Only the deletion is news, and only once; the repeat delete says nothing more. Grace hid it, so she hears
		// nothing about it at all.
		assertThat(forAda.await(e -> isUpdate(e, conversation)).get("message").get("deletedAt").asString())
				.isNotBlank();
		client.deleteMessage(ada.accessToken(), conversation, message).andExpect(status().isNoContent());
		assertThat(forAda.receivesNothingMatching(e -> isUpdate(e, conversation), 800)).isTrue();
		assertThat(forGrace.receivesNothingMatching(e -> isUpdate(e, conversation), 800)).isTrue();
	}

	@Test
	void aRemovedParticipantNoLongerHearsAboutEditsAndDeletions() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var message = client.sendNew(ada.accessToken(), group, "Before").get("id").asString();
		var forGrace = listening(grace);
		var forLinus = listening(linus);
		client.removeParticipant(ada.accessToken(), group, grace.id()).andExpect(status().isNoContent());
		forGrace.await(e -> isType(e, "conversation.changed", group));

		client.editMessage(ada.accessToken(), group, message, "After").andExpect(status().isOk());

		assertThat(forLinus.await(e -> isUpdate(e, group))).isNotNull();
		assertThat(forGrace.receivesNothingMatching(e -> "message.updated".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void editingAndDeletingSendNoPushNotification() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		client.registerDevice(grace.accessToken(), "grace-phone", "ANDROID").andExpect(status().isCreated());
		var message = client.sendNew(ada.accessToken(), conversation, "Ping").get("id").asString();
		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 1);

		client.editMessage(ada.accessToken(), conversation, message, "Ping!").andExpect(status().isOk());
		client.deleteMessage(ada.accessToken(), conversation, message).andExpect(status().isNoContent());
		Thread.sleep(1500);

		assertThat(pushes.all()).hasSize(1);
	}

	@Test
	void aParticipantWhoJoinedAfterTheMessageNeverHearsAboutItsEditsOrDeletion() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		var early = client.sendNew(ada.accessToken(), group, "Before Linus").get("id").asString();
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().is2xxSuccessful());
		var forLinus = listening(linus);
		var forGrace = listening(grace);

		client.editMessage(ada.accessToken(), group, early, "Edited before Linus").andExpect(status().isOk());
		client.deleteMessage(ada.accessToken(), group, early).andExpect(status().isNoContent());

		assertThat(forGrace.await(e -> isUpdate(e, group))).isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> "message.updated".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void someoneWhoHidTheMessageForThemselvesIsNotToldAboutItsEdits() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var message = client.sendNew(ada.accessToken(), group, "Hide me").get("id").asString();
		client.hideMessage(grace.accessToken(), group, message).andExpect(status().isNoContent());
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		client.editMessage(ada.accessToken(), group, message, "Hide me, edited").andExpect(status().isOk());

		assertThat(forLinus.await(e -> isUpdate(e, group))).isNotNull();
		assertThat(forGrace.receivesNothingMatching(e -> "message.updated".equals(e.path("type").asString()), 800))
				.isTrue();
	}

}
