package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

/** {@code aroundSeq}: the history opened at a Message (where a search result lands), not at the newest one. */
class MessageWindowTests extends IntegrationTest {

	private static final int MESSAGES = 70;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String conversationId;

	@BeforeEach
	void aConversationWithSeventyMessages() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		var started = client.startDirect(ada.accessToken(), grace.id()).andReturn().getResponse().getContentAsString();
		conversationId = json.readTree(started).get("id").asString();
		sendMessages(conversationId, 1, MESSAGES);
	}

	/** Messages numbered {@code from} to {@code to}, taking turns so neither sender meets the send limit. */
	private void sendMessages(String conversation, int from, int to) throws Exception {
		for (int i = from; i <= to; i++) {
			client.sendNew(i % 2 == 0 ? grace.accessToken() : ada.accessToken(), conversation, "message " + i);
		}
	}

	private JsonNode historyOf(Account viewer, String conversation, String query) throws Exception {
		return json.readTree(client.history(viewer.accessToken(), conversation, query).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString());
	}

	private static List<Integer> seqsOf(JsonNode page) {
		var seqs = new ArrayList<Integer>();
		page.get("messages").forEach(m -> seqs.add(m.get("seq").asInt()));
		return seqs;
	}

	private static List<Integer> range(int from, int to) {
		return IntStream.rangeClosed(from, to).boxed().toList();
	}

	private static void assertEnds(JsonNode page, boolean older, boolean newer) {
		assertThat(page.get("hasOlder").asBoolean()).as("hasOlder").isEqualTo(older);
		assertThat(page.get("hasNewer").asBoolean()).as("hasNewer").isEqualTo(newer);
		assertThat(page.get("hasMore").asBoolean()).as("hasMore means older, as on the newest page").isEqualTo(older);
	}

	private Map<Integer, String> idsBySeq() throws Exception {
		var ids = new HashMap<Integer, String>();
		historyOf(ada, conversationId, "afterSeq=0&limit=100").get("messages")
				.forEach(m -> ids.put(m.get("seq").asInt(), m.get("id").asString()));
		return ids;
	}

	@Test
	void inTheMiddleItHoldsTwentyFiveBeforeTheMessageAndTwentyFiveAfterIt() throws Exception {
		var page = historyOf(ada, conversationId, "aroundSeq=35");

		assertThat(seqsOf(page)).isEqualTo(range(10, 60));
		assertEnds(page, true, true);
		assertThat(page.get("messages").get(25).get("body").asString()).isEqualTo("message 35");
	}

	@Test
	void nearTheStartItHoldsWhatThereIsBeforeTheMessage() throws Exception {
		var page = historyOf(ada, conversationId, "aroundSeq=3");

		assertThat(seqsOf(page)).isEqualTo(range(1, 28));
		assertEnds(page, false, true);

		var exactlyTwentyFiveBefore = historyOf(ada, conversationId, "aroundSeq=26");
		assertThat(seqsOf(exactlyTwentyFiveBefore)).isEqualTo(range(1, 51));
		assertEnds(exactlyTwentyFiveBefore, false, true);
	}

	@Test
	void nearTheEndItHoldsWhatThereIsAfterTheMessage() throws Exception {
		var page = historyOf(ada, conversationId, "aroundSeq=68");

		assertThat(seqsOf(page)).isEqualTo(range(43, 70));
		assertEnds(page, true, false);

		var exactlyTwentyFiveAfter = historyOf(ada, conversationId, "aroundSeq=45");
		assertThat(seqsOf(exactlyTwentyFiveAfter)).isEqualTo(range(20, 70));
		assertEnds(exactlyTwentyFiveAfter, true, false);

		var beyondTheLatest = historyOf(ada, conversationId, "aroundSeq=500");
		assertThat(seqsOf(beyondTheLatest)).isEqualTo(range(46, 70));
		assertEnds(beyondTheLatest, true, false);
	}

	@Test
	void aShortConversationFitsInOneWindowWithNothingEitherSide() throws Exception {
		var started = client.createGroup(ada.accessToken(), "Short", grace.id()).andReturn().getResponse()
				.getContentAsString();
		var shortOne = json.readTree(started).get("id").asString();
		sendMessages(shortOne, 1, 5);

		var page = historyOf(ada, shortOne, "aroundSeq=3");

		assertThat(seqsOf(page)).isEqualTo(range(1, 5));
		assertEnds(page, false, false);
	}

	@Test
	void messagesTheViewerHidLeaveNoGapInTheWindow() throws Exception {
		var ids = idsBySeq();
		client.hideMessage(ada.accessToken(), conversationId, ids.get(30)).andExpect(status().isNoContent());
		client.hideMessage(ada.accessToken(), conversationId, ids.get(40)).andExpect(status().isNoContent());

		var page = historyOf(ada, conversationId, "aroundSeq=35");

		var expected = new ArrayList<>(range(9, 61));
		expected.removeAll(List.of(30, 40));
		assertThat(seqsOf(page)).isEqualTo(expected);
		assertEnds(page, true, true);

		// Grace hid nothing, so her window is the plain one.
		assertThat(seqsOf(historyOf(grace, conversationId, "aroundSeq=35"))).isEqualTo(range(10, 60));
	}

	@Test
	void aWindowAroundAHiddenMessageStillOpensAtItsPlace() throws Exception {
		client.hideMessage(ada.accessToken(), conversationId, idsBySeq().get(35)).andExpect(status().isNoContent());

		var page = historyOf(ada, conversationId, "aroundSeq=35");

		var expected = new ArrayList<>(range(10, 61));
		expected.remove(Integer.valueOf(35));
		assertThat(seqsOf(page)).isEqualTo(expected);
		assertEnds(page, true, true);
	}

	@Test
	void nothingFromBeforeTheViewerJoinedIsInTheWindow() throws Exception {
		var linus = client.account("Linus");
		var started = client.createGroup(ada.accessToken(), "Engines", grace.id()).andReturn().getResponse()
				.getContentAsString();
		var group = json.readTree(started).get("id").asString();
		sendMessages(group, 1, 30);
		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isOk());
		sendMessages(group, 31, 40);

		var beforeJoining = historyOf(linus, group, "aroundSeq=5");
		assertThat(seqsOf(beforeJoining)).isEqualTo(range(31, 40));
		assertEnds(beforeJoining, false, false);

		var afterJoining = historyOf(linus, group, "aroundSeq=35");
		assertThat(seqsOf(afterJoining)).isEqualTo(range(31, 40));
		assertEnds(afterJoining, false, false);

		// Those who were there all along see the older Messages in the same window.
		assertThat(seqsOf(historyOf(ada, group, "aroundSeq=35"))).isEqualTo(range(10, 40));
	}

	@Test
	void aroundSeqCannotBeCombinedWithTheOtherCursors() throws Exception {
		client.history(ada.accessToken(), conversationId, "aroundSeq=35&beforeSeq=40")
				.andExpect(status().isBadRequest());
		client.history(ada.accessToken(), conversationId, "aroundSeq=35&afterSeq=20")
				.andExpect(status().isBadRequest());
		client.history(ada.accessToken(), conversationId, "aroundSeq=35&beforeSeq=40&afterSeq=20")
				.andExpect(status().isBadRequest());
		client.history(ada.accessToken(), conversationId, "aroundSeq=0").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.aroundSeq").isNotEmpty());
	}

	@Test
	void theOtherWaysOfPagingDoNotClaimToKnowBothEnds() throws Exception {
		var newest = historyOf(ada, conversationId, "limit=10");

		assertThat(newest.has("hasOlder")).isFalse();
		assertThat(newest.has("hasNewer")).isFalse();
	}

	@Test
	void someoneOutsideTheConversationGetsTheUniformNotFound() throws Exception {
		var outsider = client.account("Outsider");

		client.history(outsider.accessToken(), conversationId, "aroundSeq=35").andExpect(status().isNotFound());
		client.history(outsider.accessToken(), conversationId, "aroundSeq=35&beforeSeq=40")
				.andExpect(status().isNotFound());
	}

	@Test
	void someoneWhoLeftAGroupCanNoLongerOpenAWindowInIt() throws Exception {
		var started = client.createGroup(ada.accessToken(), "Leaving", grace.id()).andReturn().getResponse()
				.getContentAsString();
		var group = json.readTree(started).get("id").asString();
		sendMessages(group, 1, 3);
		client.leave(grace.accessToken(), group).andExpect(status().isNoContent());

		client.history(grace.accessToken(), group, "aroundSeq=2").andExpect(status().isNotFound());
	}

}
