package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
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

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import tools.jackson.databind.JsonNode;

/** Deleting an image Message for everyone takes the image with it (#42). */
class DeleteImageMessageTests extends RealtimeIntegrationTest {

	private final HttpClient http = HttpClient.newHttpClient();

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String conversation;

	@BeforeEach
	void adaAndGrace() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private JsonNode sendImage(String caption) throws Exception {
		var upload = client.uploadImage(ada.accessToken(), "a.png", "image/png", UploadImageTests.image("png", 40, 30))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		var request = new LinkedHashMap<String, Object>();
		request.put("clientMessageId", UUID.randomUUID());
		request.put("attachmentId", json.readTree(upload).get("id").asString());
		if (caption != null) {
			request.put("body", caption);
		}
		return json.readTree(client.sendBody(ada.accessToken(), conversation, request).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString());
	}

	private int fetchStatus(String url) throws Exception {
		var link = URI.create(url);
		var local = URI.create("http://localhost:" + port + link.getRawPath() + "?" + link.getRawQuery());
		return http.send(HttpRequest.newBuilder(local).build(), HttpResponse.BodyHandlers.discarding()).statusCode();
	}

	private JsonNode sharedMessage() throws Exception {
		return json.readTree(client.history(grace.accessToken(), conversation, "").andReturn().getResponse()
				.getContentAsString()).get("messages").get(0);
	}

	@Test
	void theLinksIssuedBeforeTheDeletionStopWorking() throws Exception {
		var sent = sendImage("oops");
		var url = sent.get("attachment").get("url").asString();
		var thumbnail = sent.get("attachment").get("thumbnailUrl").asString();
		var seenByGrace = sharedMessage().get("attachment").get("url").asString();
		assertThat(fetchStatus(url)).isEqualTo(200);

		client.deleteMessage(ada.accessToken(), conversation, sent.get("id").asString()).andExpect(status().isNoContent());

		await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
			assertThat(fetchStatus(url)).isEqualTo(404);
			assertThat(fetchStatus(thumbnail)).isEqualTo(404);
			assertThat(fetchStatus(seenByGrace)).isEqualTo(404);
		});
		assertThat(sharedMessage().get("attachment").isNull()).isTrue();
	}

	@Test
	void theUpdateEventShowsNoImage() throws Exception {
		var sent = sendImage("oops");
		var forGrace = listening(grace);

		client.deleteMessage(ada.accessToken(), conversation, sent.get("id").asString()).andExpect(status().isNoContent());

		var event = forGrace.await(e -> "message.updated".equals(e.path("type").asString()));
		assertThat(event.get("message").get("deletedAt").isNull()).isFalse();
		assertThat(event.get("message").get("attachment").isNull()).isTrue();
	}

	@Test
	void aStorageFailureStillDeletesTheMessageAndTheFilesGoOnceStorageRecovers() throws Exception {
		var sent = sendImage(null);
		var url = sent.get("attachment").get("url").asString();
		storage.failDeletes();

		client.deleteMessage(ada.accessToken(), conversation, sent.get("id").asString()).andExpect(status().isNoContent());

		assertThat(sharedMessage().get("deletedAt").isNull()).isFalse();
		assertThat(fetchStatus(url)).as("storage could not delete it yet").isEqualTo(200);

		storage.reset();
		await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(fetchStatus(url)).isEqualTo(404));
	}

	@Test
	void deletingAgainIsA204ThatChangesNothingEvenWhileStorageIsDown() throws Exception {
		var sent = sendImage("oops");
		var id = sent.get("id").asString();
		client.deleteMessage(ada.accessToken(), conversation, id).andExpect(status().isNoContent());
		storage.failDeletes();

		client.deleteMessage(ada.accessToken(), conversation, id).andExpect(status().isNoContent());

		assertThat(sharedMessage().get("deletedAt").isNull()).isFalse();
	}

	@Test
	void aDeletedImageCannotBeSentAgain() throws Exception {
		var sent = sendImage("oops");
		client.deleteMessage(ada.accessToken(), conversation, sent.get("id").asString()).andExpect(status().isNoContent());

		var request = new LinkedHashMap<String, Object>();
		request.put("clientMessageId", UUID.randomUUID());
		request.put("attachmentId", sent.get("attachment").get("id").asString());
		client.sendBody(ada.accessToken(), conversation, request).andExpect(status().isNotFound());
	}

	@Test
	void deletingATextMessageTouchesNoStorage() throws Exception {
		var text = client.sendNew(ada.accessToken(), conversation, "plain").get("id").asString();
		storage.failDeletes();

		client.deleteMessage(ada.accessToken(), conversation, text).andExpect(status().isNoContent());
	}

}
