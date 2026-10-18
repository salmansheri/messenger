package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

class SendMessageTests extends IntegrationTest {

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
	void sendingStoresTheMessageAndReturnsItWithItsSequenceNumber() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();

		client.send(ada.accessToken(), conversationId, clientMessageId, "Hello Grace")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.conversationId").value(conversationId))
				.andExpect(jsonPath("$.seq").value(1))
				.andExpect(jsonPath("$.senderId").value(ada.id()))
				.andExpect(jsonPath("$.clientMessageId").value(clientMessageId))
				.andExpect(jsonPath("$.body").value("Hello Grace"))
				.andExpect(jsonPath("$.createdAt").isNotEmpty());
	}

	@Test
	void sequenceNumbersCountUpFromOneInEveryConversationIndependently() throws Exception {
		var linus = client.account("Linus Torvalds");
		var other = json.readTree(client.startDirect(ada.accessToken(), linus.id()).andReturn().getResponse()
				.getContentAsString()).get("id").asString();

		assertThat(client.sendNew(ada.accessToken(), conversationId, "one").get("seq").asInt()).isEqualTo(1);
		assertThat(client.sendNew(grace.accessToken(), conversationId, "two").get("seq").asInt()).isEqualTo(2);
		assertThat(client.sendNew(ada.accessToken(), other, "first elsewhere").get("seq").asInt()).isEqualTo(1);
		assertThat(client.sendNew(ada.accessToken(), conversationId, "three").get("seq").asInt()).isEqualTo(3);
	}

	@Test
	void theOtherParticipantReadsTheMessageInOrder() throws Exception {
		client.sendNew(ada.accessToken(), conversationId, "Hello Grace");
		client.sendNew(grace.accessToken(), conversationId, "Hello Ada");

		client.history(grace.accessToken(), conversationId, "")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.messages.length()").value(2))
				.andExpect(jsonPath("$.messages[0].seq").value(1))
				.andExpect(jsonPath("$.messages[0].body").value("Hello Grace"))
				.andExpect(jsonPath("$.messages[0].senderId").value(ada.id()))
				.andExpect(jsonPath("$.messages[1].seq").value(2))
				.andExpect(jsonPath("$.messages[1].senderId").value(grace.id()))
				.andExpect(jsonPath("$.hasMore").value(false));
	}

	@Test
	void retryingASendWithTheSameClientMessageIdReturnsTheOriginalAndCreatesNoDuplicate() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();
		var first = client.send(ada.accessToken(), conversationId, clientMessageId, "Hello")
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();

		var retry = client.send(ada.accessToken(), conversationId, clientMessageId, "Hello")
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

		assertThat(json.readTree(retry)).isEqualTo(json.readTree(first));
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(1));
		assertThat(client.sendNew(ada.accessToken(), conversationId, "next").get("seq").asInt())
				.as("a retry does not use up a sequence number").isEqualTo(2);
	}

	@Test
	void reusingAClientMessageIdForDifferentTextIsAConflictAndChangesNothing() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();
		client.send(ada.accessToken(), conversationId, clientMessageId, "Hello").andExpect(status().isCreated());

		client.send(ada.accessToken(), conversationId, clientMessageId, "Something else")
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));

		client.history(ada.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages.length()").value(1))
				.andExpect(jsonPath("$.messages[0].body").value("Hello"));
	}

	@Test
	void aClientMessageIdIsScopedToItsConversationAndSender() throws Exception {
		var linus = client.account("Linus Torvalds");
		var other = json.readTree(client.startDirect(ada.accessToken(), linus.id()).andReturn().getResponse()
				.getContentAsString()).get("id").asString();
		var shared = UUID.randomUUID().toString();

		client.send(ada.accessToken(), conversationId, shared, "in the first").andExpect(status().isCreated());
		client.send(ada.accessToken(), other, shared, "in the second").andExpect(status().isCreated());
		client.send(grace.accessToken(), conversationId, shared, "from the other sender")
				.andExpect(status().isCreated()).andExpect(jsonPath("$.senderId").value(grace.id()));
	}

	@Test
	void concurrentSendsFromBothParticipantsGetUniqueConsecutiveSequenceNumbers() throws Exception {
		var tasks = new ArrayList<Callable<Integer>>();
		for (int i = 0; i < 20; i++) {
			var n = i;
			tasks.add(() -> client.sendNew(ada.accessToken(), conversationId, "ada " + n).get("seq").asInt());
			tasks.add(() -> client.sendNew(grace.accessToken(), conversationId, "grace " + n).get("seq").asInt());
		}
		List<Integer> seqs = new ArrayList<>();
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			for (var future : tasks.stream().map(executor::submit).toList()) {
				seqs.add(future.get());
			}
		}

		assertThat(seqs).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(
				java.util.stream.IntStream.rangeClosed(1, 40).boxed().toList());
		client.history(ada.accessToken(), conversationId, "limit=100")
				.andExpect(jsonPath("$.messages.length()").value(40))
				.andExpect(jsonPath("$.messages[0].seq").value(1))
				.andExpect(jsonPath("$.messages[39].seq").value(40));
	}

	@Test
	void whenTheSameSendIsRetriedConcurrentlyExactlyOneIsCreated() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();

		var tasks = new ArrayList<Callable<Integer>>();
		for (int i = 0; i < 6; i++) {
			tasks.add(() -> client.send(ada.accessToken(), conversationId, clientMessageId, "Hello")
					.andReturn().getResponse().getStatus());
		}
		List<Integer> statuses = new ArrayList<>();
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			for (var future : tasks.stream().map(executor::submit).toList()) {
				statuses.add(future.get());
			}
		}

		assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
		assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(5);
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(1));
	}

	@Test
	void aNonParticipantCannotSendOrReadAndLearnsNothingAboutTheConversation() throws Exception {
		var outsider = client.account("Outsider");
		client.sendNew(ada.accessToken(), conversationId, "private");

		var send = client.send(outsider.accessToken(), conversationId, UUID.randomUUID().toString(), "hi")
				.andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		var read = client.history(outsider.accessToken(), conversationId, "")
				.andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		var unknown = client.history(outsider.accessToken(), UUID.randomUUID().toString(), "")
				.andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();

		assertThat(json.readTree(read).get("detail")).isEqualTo(json.readTree(unknown).get("detail"));
		assertThat(json.readTree(send).get("detail")).isEqualTo(json.readTree(unknown).get("detail"));
		assertThat(read).doesNotContain("private");
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(1));
	}

	@Test
	void emptyBlankAndOversizedTextIsRejectedAndNothingIsStored() throws Exception {
		for (var bad : new String[] { "", "   ", "\n\t", "x".repeat(4001) }) {
			client.send(ada.accessToken(), conversationId, UUID.randomUUID().toString(), bad)
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.body").isNotEmpty());
		}
		client.history(ada.accessToken(), conversationId, "").andExpect(jsonPath("$.messages.length()").value(0));
	}

	@Test
	void textUpToTheLimitIsStoredExactlyAsSentIncludingEmojiAndWhitespace() throws Exception {
		var longest = "é".repeat(4000);
		client.sendNew(ada.accessToken(), conversationId, longest);
		var emoji = "  hi 👩‍💻 there\n";
		client.sendNew(ada.accessToken(), conversationId, emoji);

		client.history(grace.accessToken(), conversationId, "")
				.andExpect(jsonPath("$.messages[0].body").value(longest))
				.andExpect(jsonPath("$.messages[1].body").value(emoji));
	}

	@Test
	void aMissingOrMalformedClientMessageIdIsAValidationError() throws Exception {
		client.sendBody(ada.accessToken(), conversationId, java.util.Map.of("body", "hi"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.clientMessageId").isNotEmpty());
		client.send(ada.accessToken(), conversationId, "not-a-uuid", "hi").andExpect(status().isBadRequest());
	}

	@Test
	void aMalformedConversationIdIsABadRequestNotAServerError() throws Exception {
		client.history(ada.accessToken(), "not-a-uuid", "").andExpect(status().isBadRequest());
	}

	@Test
	void bothEndpointsRequireAuthentication() throws Exception {
		client.historyWithoutToken(conversationId).andExpect(status().isUnauthorized());
		client.send("not-a-jwt", conversationId, UUID.randomUUID().toString(), "hi")
				.andExpect(status().isUnauthorized());
	}

}
