package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import tools.jackson.databind.JsonNode;

/** Replying to a Story: an ordinary Message in the Direct conversation, quoting the Story (#73). */
class StoryReplyTests extends RealtimeIntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private String direct;

	@BeforeEach
	void accounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		direct = idOf(client.startDirect(ada.accessToken(), grace.id()).andExpect(status().isCreated()));
	}

	/** Sends {@code body} from {@code account} to {@code conversation} as a reply to {@code story}. */
	private ResultActions reply(Account account, String conversation, Object story, String body, UUID clientMessageId)
			throws Exception {
		var request = new LinkedHashMap<String, Object>();
		request.put("clientMessageId", clientMessageId);
		request.put("body", body);
		request.put("replyToStoryId", story);
		return client.sendBody(account.accessToken(), conversation, request);
	}

	private ResultActions reply(Account account, Object story, String body) throws Exception {
		return reply(account, direct, story, body, UUID.randomUUID());
	}

	private JsonNode read(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString());
	}

	@Test
	void aReplyIsAMessageInTheDirectConversationQuotingTheStoryEverywhereItIsShown() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Off to the Analytical Engine", "MOSS"));
		var forAda = listening(ada);

		var sent = reply(grace, story, "Have fun!").andExpect(status().isCreated())
				.andExpect(jsonPath("$.body").value("Have fun!")).andExpect(jsonPath("$.replyTo").doesNotExist())
				.andExpect(jsonPath("$.storyQuote.storyId").value(story))
				.andExpect(jsonPath("$.storyQuote.kind").value("TEXT"))
				.andExpect(jsonPath("$.storyQuote.text").value("Off to the Analytical Engine"))
				.andExpect(jsonPath("$.storyQuote.unavailable").value(false));
		var id = idOf(sent);

		var created = forAda.await(e -> "message.created".equals(e.path("type").asString()));
		assertThat(created.get("message").get("storyQuote").get("storyId").asString()).isEqualTo(story);
		var page = read(client.history(ada.accessToken(), direct, "").andExpect(status().isOk()));
		var shown = page.get("messages").get(page.get("messages").size() - 1);
		assertThat(shown.get("id").asString()).isEqualTo(id);
		assertThat(shown.get("storyQuote").get("text").asString()).isEqualTo("Off to the Analytical Engine");
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.storyQuote.storyId").value(story));
		var plain = client.sendNew(ada.accessToken(), direct, "Thanks");
		assertThat(plain.path("storyQuote").isNull() || plain.path("storyQuote").isMissingNode()).isTrue();
	}

	@Test
	void onlyALiveStoryOfTheOtherParticipantThatTheReplierCanSeeCanBeAnswered() throws Exception {
		client.startDirect(linus.accessToken(), grace.id()).andExpect(status().isCreated());
		var linusStory = idOf(client.postTextStory(linus.accessToken(), "Linus's", "SEA"));
		var graceOwn = idOf(client.postTextStory(grace.accessToken(), "Grace's own", "SEA"));
		var deleted = idOf(client.postTextStory(ada.accessToken(), "Deleted", "SEA"));
		client.deleteStory(ada.accessToken(), deleted).andExpect(status().isNoContent());
		var adas = idOf(client.postTextStory(ada.accessToken(), "Ada's", "SEA"));
		var group = idOf(client.createGroup(grace.accessToken(), "Team", ada.id(), linus.id()));

		for (var story : new String[] { linusStory, graceOwn, deleted, UUID.randomUUID().toString() }) {
			reply(grace, story, "Hi").andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("Story not found."));
		}
		reply(grace, group, adas, "In the group", UUID.randomUUID()).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Story not found."));

		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent()); // Grace cannot see it now
		reply(grace, adas, "Hi").andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Story not found."));
		client.unblock(ada.accessToken(), grace.id()).andExpect(status().isNoContent());

		clock.advance(Duration.ofHours(24).plusMinutes(1));
		var graceAgain = client.loginForTokens(grace.email(), AuthClient.PASSWORD).accessToken();
		var request = Map.of("clientMessageId", UUID.randomUUID(), "body", "Late", "replyToStoryId", adas);
		client.sendBody(graceAgain, direct, request).andExpect(status().isNotFound());
		var page = read(client.history(graceAgain, direct, ""));
		assertThat(page.get("messages")).isEmpty(); // nothing was sent
	}

	@Test
	void aMessageAnswersAMessageOrAStoryNotBoth() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Story", "SEA"));
		var message = client.sendNew(ada.accessToken(), direct, "Message").get("id").asString();

		client.sendBody(grace.accessToken(), direct, Map.of("clientMessageId", UUID.randomUUID(), "body", "Both",
				"replyToMessageId", message, "replyToStoryId", story)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.oneReplyTarget").value("cannot answer a Message and a Story at once"));
	}

	@Test
	void aRetryWithTheSameStoryIsTheSameMessageAndAnotherStoryIsAConflict() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "First", "SEA"));
		var other = idOf(client.postTextStory(ada.accessToken(), "Second", "SEA"));
		var clientMessageId = UUID.randomUUID();
		var id = idOf(reply(grace, direct, story, "Nice", clientMessageId).andExpect(status().isCreated()));

		reply(grace, direct, story, "Nice", clientMessageId).andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id)).andExpect(jsonPath("$.storyQuote.storyId").value(story));
		reply(grace, direct, other, "Nice", clientMessageId).andExpect(status().isConflict());
		client.sendBody(grace.accessToken(), direct, Map.of("clientMessageId", clientMessageId, "body", "Nice"))
				.andExpect(status().isConflict());
	}

	@Test
	void aPhotoStoryIsQuotedInWordsAndAGoneStoryIsUnavailableWithNothingElse() throws Exception {
		var upload = idOf(client.uploadImage(ada.accessToken(), "a.png", "image/png", UploadImageTests.image("png", 20, 20)));
		var photo = idOf(client.postStoryBody(ada.accessToken(),
				Map.of("kind", "PHOTO", "attachmentId", upload, "text", "At Bletchley")));
		var bare = idOf(client.postStoryBody(ada.accessToken(),
				Map.of("kind", "PHOTO", "attachmentId", idOf(client.uploadImage(ada.accessToken(), "b.png", "image/png",
						UploadImageTests.image("png", 20, 20))))));
		var text = idOf(client.postTextStory(ada.accessToken(), "x".repeat(150), "SEA"));

		reply(grace, photo, "Lovely").andExpect(jsonPath("$.storyQuote.kind").value("PHOTO"))
				.andExpect(jsonPath("$.storyQuote.text").value("Photo: At Bletchley"));
		reply(grace, bare, "Where?").andExpect(jsonPath("$.storyQuote.text").value("Photo"));
		reply(grace, text, "Long").andExpect(jsonPath("$.storyQuote.text").value("x".repeat(100) + "\u2026"));

		client.deleteStory(ada.accessToken(), photo).andExpect(status().isNoContent());
		var quotes = read(client.history(ada.accessToken(), direct, "")).get("messages");
		assertThat(quotes.get(0).get("storyQuote").get("unavailable").asBoolean()).isTrue();
		assertThat(quotes.get(0).get("storyQuote").get("storyId").isNull()).isTrue();
		assertThat(quotes.get(0).get("storyQuote").get("text").isNull()).isTrue();
		assertThat(quotes.get(0).get("storyQuote").get("kind").isNull()).isTrue();
		assertThat(quotes.get(1).get("storyQuote").get("unavailable").asBoolean()).isFalse();

		clock.advance(Duration.ofHours(24).plusMinutes(1)); // the rest expire (and are swept)
		var adaAgain = client.loginForTokens(ada.email(), AuthClient.PASSWORD).accessToken();
		for (var message : read(client.history(adaAgain, direct, "")).get("messages")) {
			assertThat(message.get("storyQuote").get("unavailable").asBoolean()).isTrue();
			assertThat(message.get("storyQuote").get("storyId").isNull()).isTrue();
		}
	}

	@Test
	void replyingReadsTheConversationUpToItAsAnyReplyDoes() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Story", "SEA"));
		client.sendNew(ada.accessToken(), direct, "Did you see it?");
		var forAda = listening(ada);

		reply(grace, story, "Yes!").andExpect(status().isCreated());

		var receipts = forAda.await(e -> "receipts.updated".equals(e.path("type").asString()));
		assertThat(receipts.get("readUpTo").asInt()).as("Ada's question is read").isGreaterThanOrEqualTo(1);
	}

}
