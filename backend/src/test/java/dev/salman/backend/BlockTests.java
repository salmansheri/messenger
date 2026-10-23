package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import dev.salman.backend.support.StompTestClient;
import tools.jackson.databind.JsonNode;

/** Ada blocks Grace in their Direct conversation (#58 of #57); what a Block withholds comes in later tickets. */
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
		client.sendBody(ada.accessToken(), withGrace, java.util.Map.of("clientMessageId", UUID.randomUUID(),
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
