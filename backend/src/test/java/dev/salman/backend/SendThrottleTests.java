package dev.salman.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

class SendThrottleTests extends IntegrationTest {

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

	@Test
	void aUserMaySendSixtyNewMessagesAMinuteAndTheNextIsRefusedWithRetryAfter() throws Exception {
		for (int i = 1; i <= 60; i++) {
			client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Message " + i)
					.andExpect(status().isCreated());
		}

		client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "One too many")
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(429))
				.andExpect(header().exists("Retry-After"));
	}

	@Test
	void aRetryOfAMessageTheServerAlreadyStoredIsNotCountedAndStillAnswers200() throws Exception {
		var first = UUID.randomUUID().toString();
		client.send(ada.accessToken(), conversationId, first, "Hello").andExpect(status().isCreated());
		for (int i = 2; i <= 59; i++) {
			client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Message " + i)
					.andExpect(status().isCreated());
		}

		for (int retry = 1; retry <= 5; retry++) {
			client.send(ada.accessToken(), conversationId, first, "Hello").andExpect(status().isOk());
		}

		client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "The sixtieth")
				.andExpect(status().isCreated());
		client.send(ada.accessToken(), conversationId, first, "Hello").andExpect(status().isOk());
		client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "The sixty-first")
				.andExpect(status().isTooManyRequests());
	}

	@Test
	void aRefusedSendStoresNothingAndLeavesNoGapInTheSequence() throws Exception {
		for (int i = 1; i <= 60; i++) {
			client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Message " + i)
					.andExpect(status().isCreated());
		}

		client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Refused")
				.andExpect(status().isTooManyRequests());

		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages.length()").value(50))
				.andExpect(jsonPath("$.messages[49].seq").value(60))
				.andExpect(jsonPath("$.messages[49].body").value("Message 60"));
	}

	@Test
	void theLimitBelongsToTheSenderSoTheirRecipientCanStillReply() throws Exception {
		for (int i = 1; i <= 61; i++) {
			client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Message " + i);
		}

		client.send(grace.accessToken(), conversationId, UUID.randomUUID().toString(), "Grace answers")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.seq").value(61));
	}

	@Test
	void aUserMayMakeOneHundredTwentyChangesAMinuteAndTheNextIsRefusedWithRetryAfter() throws Exception {
		for (int i = 1; i <= 120; i++) {
			mvc.perform(post("/api/v1/auth/_probe/message-change/{userId}", ada.id())).andExpect(status().isNoContent());
		}

		mvc.perform(post("/api/v1/auth/_probe/message-change/{userId}", ada.id()))
				.andExpect(status().isTooManyRequests())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(header().exists("Retry-After"));
		mvc.perform(post("/api/v1/auth/_probe/message-change/{userId}", grace.id())).andExpect(status().isNoContent());
	}

	@Test
	void changesAndSendsHaveSeparateAllowances() throws Exception {
		for (int i = 1; i <= 121; i++) {
			mvc.perform(post("/api/v1/auth/_probe/message-change/{userId}", ada.id()));
		}

		client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), "Still may send")
				.andExpect(status().isCreated());
	}

}
