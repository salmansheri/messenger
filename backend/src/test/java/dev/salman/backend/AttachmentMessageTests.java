package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import tools.jackson.databind.JsonNode;

/** Sending a Message with an image (#41): who sees it, how it reads in lists, pushes and quotes. */
class AttachmentMessageTests extends RealtimeIntegrationTest {

	private final HttpClient http = HttpClient.newHttpClient();

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
		direct = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private String upload(Account who) throws Exception {
		var created = client.uploadImage(who.accessToken(), "a.png", "image/png", UploadImageTests.image("png", 64, 48))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return json.readTree(created).get("id").asString();
	}

	private ResultActions send(Account who, String conversation, Object clientMessageId, String attachmentId,
			String caption) throws Exception {
		var request = new LinkedHashMap<String, Object>();
		request.put("clientMessageId", clientMessageId);
		if (caption != null) {
			request.put("body", caption);
		}
		if (attachmentId != null) {
			request.put("attachmentId", attachmentId);
		}
		return client.sendBody(who.accessToken(), conversation, request);
	}

	private JsonNode sendImage(Account who, String conversation, String caption) throws Exception {
		return json.readTree(send(who, conversation, UUID.randomUUID(), upload(who), caption)
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
	}

	private int fetchStatus(String url) throws Exception {
		var link = URI.create(url);
		var local = URI.create("http://localhost:" + port + link.getRawPath() + "?" + link.getRawQuery());
		return http.send(HttpRequest.newBuilder(local).build(), HttpResponse.BodyHandlers.discarding()).statusCode();
	}

	private JsonNode history(Account who, String conversation) throws Exception {
		return json.readTree(client.history(who.accessToken(), conversation, "").andExpect(status().isOk()).andReturn()
				.getResponse().getContentAsString());
	}

	// ---- sending

	@Test
	void anImageAloneIsAMessageWithNoTextAndLinksToTheImage() throws Exception {
		var attachment = upload(ada);

		var sent = json.readTree(send(ada, direct, UUID.randomUUID(), attachment, null).andExpect(status().isCreated())
				.andExpect(jsonPath("$.body").doesNotExist()).andExpect(jsonPath("$.attachment.id").value(attachment))
				.andExpect(jsonPath("$.attachment.width").value(64)).andExpect(jsonPath("$.attachment.height").value(48))
				.andReturn().getResponse().getContentAsString());

		assertThat(fetchStatus(sent.get("attachment").get("url").asString())).isEqualTo(200);
		assertThat(fetchStatus(sent.get("attachment").get("thumbnailUrl").asString())).isEqualTo(200);
	}

	@Test
	void anImageWithACaptionKeepsBoth() throws Exception {
		send(ada, direct, UUID.randomUUID(), upload(ada), "Lunch today").andExpect(status().isCreated())
				.andExpect(jsonPath("$.body").value("Lunch today")).andExpect(jsonPath("$.attachment.url").isNotEmpty());
	}

	@Test
	void aMessageWithNeitherTextNorImageIsRefusedAndAPlainOneHasNoAttachment() throws Exception {
		send(ada, direct, UUID.randomUUID(), null, null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.textOrImage").isNotEmpty());
		send(ada, direct, UUID.randomUUID(), upload(ada), "   ").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.body").isNotEmpty());

		send(ada, direct, UUID.randomUUID(), null, "just text").andExpect(status().isCreated())
				.andExpect(jsonPath("$.attachment").value((Object) null));
		assertThat(history(ada, direct).get("messages")).hasSize(1);
	}

	@Test
	void someoneElsesAnUnknownAndAnAlreadyUsedUploadAreTheSameNotFound() throws Exception {
		var graces = upload(grace);
		var used = upload(ada);
		send(ada, direct, UUID.randomUUID(), used, null).andExpect(status().isCreated());

		var detail = new java.util.HashSet<String>();
		for (var attachment : new String[] { graces, UUID.randomUUID().toString(), used }) {
			var body = send(ada, direct, UUID.randomUUID(), attachment, null).andExpect(status().isNotFound())
					.andReturn().getResponse().getContentAsString();
			detail.add(json.readTree(body).get("detail").asString());
		}
		assertThat(detail).containsExactly("Attachment not found.");
		assertThat(history(ada, direct).get("messages")).hasSize(1);
	}

	@Test
	void anUploadCannotBeSentToAConversationItsOwnerIsNotIn() throws Exception {
		var stranger = idOf(client.startDirect(grace.accessToken(), linus.id()));
		send(ada, stranger, UUID.randomUUID(), upload(ada), null).andExpect(status().isNotFound());
	}

	// ---- retries

	@Test
	void aRetryWithTheSameClientMessageIdAndImageAnswers200WithTheSameMessage() throws Exception {
		var cmid = UUID.randomUUID();
		var attachment = upload(ada);
		var first = json.readTree(send(ada, direct, cmid, attachment, "hi").andExpect(status().isCreated()).andReturn()
				.getResponse().getContentAsString());

		send(ada, direct, cmid, attachment, "hi").andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(first.get("id").asString()))
				.andExpect(jsonPath("$.attachment.id").value(attachment));
		assertThat(history(ada, direct).get("messages")).hasSize(1);
	}

	@Test
	void aDifferentImageOrDifferentTextForTheSameClientMessageIdIsAConflict() throws Exception {
		var cmid = UUID.randomUUID();
		var attachment = upload(ada);
		send(ada, direct, cmid, attachment, "hi").andExpect(status().isCreated());

		send(ada, direct, cmid, upload(ada), "hi").andExpect(status().isConflict());
		send(ada, direct, cmid, attachment, "other").andExpect(status().isConflict());
		send(ada, direct, cmid, null, "hi").andExpect(status().isConflict());
	}

	// ---- who sees it

	@Test
	void historyCatchUpAndTheListShowTheImageToTheOtherParticipant() throws Exception {
		var sent = sendImage(ada, direct, "look");

		var viewed = history(grace, direct).get("messages").get(0);
		assertThat(viewed.get("attachment").get("id").asString()).isEqualTo(sent.get("attachment").get("id").asString());
		assertThat(fetchStatus(viewed.get("attachment").get("url").asString())).isEqualTo(200);
		var caughtUp = json.readTree(client.history(grace.accessToken(), direct, "afterSeq=0").andReturn().getResponse()
				.getContentAsString());
		assertThat(caughtUp.get("messages").get(0).get("attachment").get("id").asString())
				.isEqualTo(sent.get("attachment").get("id").asString());
		client.conversations(grace.accessToken()).andExpect(status().isOk())
				.andExpect(jsonPath("$[0].lastMessage.attachment.id").value(sent.get("attachment").get("id").asString()));
	}

	@Test
	void someoneWhoJoinedLaterOrHidIt_neverSeesTheImage() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Team", grace.id()));
		var sent = sendImage(ada, group, null);
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isOk());

		assertThat(history(linus, group).get("messages")).isEmpty();
		client.hideMessage(grace.accessToken(), group, sent.get("id").asString()).andExpect(status().isNoContent());
		assertThat(history(grace, group).get("messages")).isEmpty();
		assertThat(history(ada, group).get("messages").get(0).get("attachment").isNull()).isFalse();
	}

	@Test
	void theLiveEventCarriesTheImageToCurrentParticipantsOnly() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Team", grace.id(), linus.id()));
		client.removeParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isNoContent());
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		var sent = sendImage(ada, group, "live");

		var event = forGrace.await(e -> "message.created".equals(e.path("type").asString()));
		assertThat(event.get("message").get("attachment").get("id").asString())
				.isEqualTo(sent.get("attachment").get("id").asString());
		assertThat(fetchStatus(event.get("message").get("attachment").get("url").asString())).isEqualTo(200);
		assertThat(forLinus.receivesNothingMatching(e -> "message.created".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	// ---- wording

	@Test
	void aPushSaysPhotoWithTheCaptionWhenThereIsOne() throws Exception {
		client.registerDevice(grace.accessToken(), "grace-phone", "ANDROID").andExpect(status().isCreated());

		sendImage(ada, direct, null);
		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 1);
		sendImage(ada, direct, "Lunch today");
		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 2);

		assertThat(pushes.all()).extracting(p -> p.body()).containsExactlyInAnyOrder("Photo", "Photo: Lunch today");
	}

	@Test
	void aReplyQuotesAnImageAsPhotoWithItsCaptionAndNeverTheImage() throws Exception {
		var plain = sendImage(ada, direct, null).get("id").asString();
		var captioned = sendImage(ada, direct, "Lunch today").get("id").asString();

		client.sendReply(grace.accessToken(), direct, UUID.randomUUID().toString(), "nice", plain)
				.andExpect(status().isCreated()).andExpect(jsonPath("$.replyTo.text").value("Photo"))
				.andExpect(jsonPath("$.replyTo.attachment").doesNotExist());
		client.sendReply(grace.accessToken(), direct, UUID.randomUUID().toString(), "nice", captioned)
				.andExpect(status().isCreated()).andExpect(jsonPath("$.replyTo.text").value("Photo: Lunch today"));
	}

	// ---- the rest of the Message features

	@Test
	void anImageCanAnswerAMessageBeReactedToAndHaveItsCaptionEdited() throws Exception {
		var question = client.sendNew(grace.accessToken(), direct, "What is it?").get("id").asString();
		var attachment = upload(ada);
		var answer = json.readTree(client.sendBody(ada.accessToken(), direct, java.util.Map.of("clientMessageId",
				UUID.randomUUID(), "attachmentId", attachment, "replyToMessageId", question))
				.andExpect(status().isCreated()).andExpect(jsonPath("$.replyTo.text").value("What is it?"))
				.andReturn().getResponse().getContentAsString());
		var id = answer.get("id").asString();

		client.react(grace.accessToken(), direct, id, "❤️").andExpect(status().isOk())
				.andExpect(jsonPath("$.attachment.id").value(attachment))
				.andExpect(jsonPath("$.reactions[0].userIds[0]").value(grace.id()));
		client.editMessage(ada.accessToken(), direct, id, "It is a cat").andExpect(status().isOk())
				.andExpect(jsonPath("$.body").value("It is a cat")).andExpect(jsonPath("$.attachment.id").value(attachment))
				.andExpect(jsonPath("$.editedAt").isNotEmpty());
		var viewed = history(grace, direct).get("messages").get(1);
		assertThat(viewed.get("attachment").get("id").asString()).isEqualTo(attachment);
		assertThat(viewed.get("body").asString()).isEqualTo("It is a cat");
	}

	@Test
	void editingAnImageOnlyMessageAddsACaptionAndNothingElseChanges() throws Exception {
		var sent = sendImage(ada, direct, null);

		client.editMessage(ada.accessToken(), direct, sent.get("id").asString(), "Added later")
				.andExpect(status().isOk()).andExpect(jsonPath("$.body").value("Added later"))
				.andExpect(jsonPath("$.attachment.id").value(sent.get("attachment").get("id").asString()));
	}

	@Test
	void aDeletedImageMessageShowsNoImage() throws Exception {
		var sent = sendImage(ada, direct, "oops");

		client.deleteMessage(ada.accessToken(), direct, sent.get("id").asString()).andExpect(status().isNoContent());

		var shown = history(grace, direct).get("messages").get(0);
		assertThat(shown.get("deletedAt").isNull()).isFalse();
		assertThat(shown.get("attachment").isNull()).isTrue();
		assertThat(shown.get("body").isNull()).isTrue();
	}

}
