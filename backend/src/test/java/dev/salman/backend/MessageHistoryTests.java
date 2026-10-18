package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

class MessageHistoryTests extends IntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String conversationId;

	@BeforeEach
	void aConversationWithTwentyFiveMessages() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		var started = client.startDirect(ada.accessToken(), grace.id()).andReturn().getResponse().getContentAsString();
		conversationId = json.readTree(started).get("id").asString();
		for (int i = 1; i <= 25; i++) {
			client.sendNew(i % 2 == 0 ? grace.accessToken() : ada.accessToken(), conversationId, "message " + i);
		}
	}

	private List<Integer> seqs(String query) throws Exception {
		var page = json.readTree(client.history(ada.accessToken(), conversationId, query).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString());
		var seqs = new ArrayList<Integer>();
		page.get("messages").forEach(m -> seqs.add(m.get("seq").asInt()));
		return seqs;
	}

	private static List<Integer> range(int from, int to) {
		return IntStream.rangeClosed(from, to).boxed().toList();
	}

	@Test
	void withoutParametersTheNewestMessagesComeBackOldestFirst() throws Exception {
		assertThat(seqs("")).isEqualTo(range(1, 25));
		assertThat(seqs("limit=10")).isEqualTo(range(16, 25));
		client.history(ada.accessToken(), conversationId, "limit=10").andExpect(jsonPath("$.hasMore").value(true));
		client.history(ada.accessToken(), conversationId, "limit=25").andExpect(jsonPath("$.hasMore").value(false));
	}

	@Test
	void beforeSeqPagesBackThroughOlderMessages() throws Exception {
		assertThat(seqs("beforeSeq=16&limit=10")).isEqualTo(range(6, 15));
		client.history(ada.accessToken(), conversationId, "beforeSeq=16&limit=10")
				.andExpect(jsonPath("$.hasMore").value(true));

		assertThat(seqs("beforeSeq=6&limit=10")).isEqualTo(range(1, 5));
		client.history(ada.accessToken(), conversationId, "beforeSeq=6&limit=10")
				.andExpect(jsonPath("$.hasMore").value(false));
	}

	@Test
	void beforeSeqAtTheEdgesGivesNothingOrTheNewestPage() throws Exception {
		assertThat(seqs("beforeSeq=1")).isEmpty();
		assertThat(seqs("beforeSeq=2")).isEqualTo(range(1, 1));
		assertThat(seqs("beforeSeq=1000&limit=5")).isEqualTo(range(21, 25));
	}

	@Test
	void afterSeqCatchesUpOnNewerMessagesOldestFirst() throws Exception {
		assertThat(seqs("afterSeq=20")).isEqualTo(range(21, 25));
		client.history(ada.accessToken(), conversationId, "afterSeq=20").andExpect(jsonPath("$.hasMore").value(false));

		assertThat(seqs("afterSeq=0&limit=10")).isEqualTo(range(1, 10));
		client.history(ada.accessToken(), conversationId, "afterSeq=0&limit=10")
				.andExpect(jsonPath("$.hasMore").value(true));
		assertThat(seqs("afterSeq=10&limit=10")).isEqualTo(range(11, 20));
	}

	@Test
	void afterSeqAtOrBeyondTheLatestGivesNothing() throws Exception {
		assertThat(seqs("afterSeq=24")).isEqualTo(range(25, 25));
		assertThat(seqs("afterSeq=25")).isEmpty();
		assertThat(seqs("afterSeq=100")).isEmpty();
		client.history(ada.accessToken(), conversationId, "afterSeq=25").andExpect(jsonPath("$.hasMore").value(false));
	}

	@Test
	void walkingBackPageByPageReconstructsTheWholeConversationWithoutGapsOrRepeats() throws Exception {
		var all = new ArrayList<Integer>();
		var page = seqs("limit=7");
		for (int guard = 0; !page.isEmpty() && guard < 10; guard++) { // 25 messages need only 4 pages
			all.addAll(0, page);
			page = seqs("beforeSeq=" + page.getFirst() + "&limit=7");
		}

		assertThat(all).isEqualTo(range(1, 25));
	}

	@Test
	void catchingUpAfterBeingOfflinePicksUpExactlyWhatWasMissed() throws Exception {
		var lastSeen = seqs("limit=5").getLast();
		client.sendNew(grace.accessToken(), conversationId, "while you were away 1");
		client.sendNew(grace.accessToken(), conversationId, "while you were away 2");
		client.sendNew(grace.accessToken(), conversationId, "while you were away 3");

		assertThat(seqs("afterSeq=" + lastSeen)).isEqualTo(range(26, 28));
	}

	@Test
	void everyMessageCarriesItsSenderTextAndSequenceNumber() throws Exception {
		client.history(grace.accessToken(), conversationId, "afterSeq=22")
				.andExpect(jsonPath("$.messages[0].seq").value(23))
				.andExpect(jsonPath("$.messages[0].body").value("message 23"))
				.andExpect(jsonPath("$.messages[0].senderId").value(ada.id()))
				.andExpect(jsonPath("$.messages[1].senderId").value(grace.id()));
	}

	@Test
	void invalidPagingParametersAreValidationErrors() throws Exception {
		client.history(ada.accessToken(), conversationId, "beforeSeq=5&afterSeq=2")
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
		for (var bad : new String[] { "limit=0", "limit=101", "limit=-1" }) {
			client.history(ada.accessToken(), conversationId, bad).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.limit").isNotEmpty());
		}
		client.history(ada.accessToken(), conversationId, "beforeSeq=0").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.beforeSeq").isNotEmpty());
		client.history(ada.accessToken(), conversationId, "afterSeq=-1").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.afterSeq").isNotEmpty());
		client.history(ada.accessToken(), conversationId, "afterSeq=abc").andExpect(status().isBadRequest());
	}

	@Test
	void theLargestAllowedPageIsOneHundred() throws Exception {
		assertThat(seqs("limit=100")).isEqualTo(range(1, 25));
	}

	@Test
	void aNonParticipantAlwaysGetsTheSameNotFoundEvenWithInvalidPagingParameters() throws Exception {
		var outsider = client.account("Outsider");

		client.history(outsider.accessToken(), conversationId, "beforeSeq=5&afterSeq=2")
				.andExpect(status().isNotFound());
		client.history(outsider.accessToken(), conversationId, "").andExpect(status().isNotFound());
	}

}
