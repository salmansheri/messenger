package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

/** Searching every Conversation a User is in: the same rules as in one, applied per Conversation. */
class AllConversationsSearchTests extends IntegrationTest {

	private static final String START = "";
	private static final String END = "";

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;

	@BeforeEach
	void threePeople() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
	}

	private String idOf(String body) {
		return json.readTree(body).get("id").asString();
	}

	private String direct(Account a, Account b) throws Exception {
		return idOf(client.startDirect(a.accessToken(), b.id()).andReturn().getResponse().getContentAsString());
	}

	private String group(String name, Account... others) throws Exception {
		var ids = java.util.Arrays.stream(others).map(Account::id).toArray();
		return idOf(client.createGroup(ada.accessToken(), name, ids).andReturn().getResponse().getContentAsString());
	}

	private String say(Account who, String conversation, String text) throws Exception {
		return client.sendNew(who.accessToken(), conversation, text).get("id").asString();
	}

	private JsonNode search(Account who, String q, String before) throws Exception {
		return json.readTree(client.searchAll(who.accessToken(), q, before).andExpect(status().isOk()).andReturn()
				.getResponse().getContentAsString());
	}

	/** The snippets found, newest first, with the marks taken out. */
	private List<String> found(Account who, String q) throws Exception {
		var texts = new ArrayList<String>();
		search(who, q, null).get("results")
				.forEach(r -> texts.add(r.get("snippet").asString().replace(START, "").replace(END, "")));
		return texts;
	}

	@Test
	void findsMatchesInEveryConversationNewestFirstSayingWhichConversation() throws Exception {
		var withGrace = direct(ada, grace);
		var engines = group("Engines", grace, linus);
		var withLinus = direct(ada, linus);
		var first = say(grace, withGrace, "plan for monday");
		say(linus, engines, "the engine plan");
		var third = say(ada, withLinus, "plans changed");
		say(ada, withGrace, "nothing to see");

		var results = search(ada, "plan", null).get("results");

		assertThat(results).hasSize(3);
		assertThat(results.get(0).get("messageId").asString()).isEqualTo(third);
		assertThat(results.get(0).get("conversationId").asString()).isEqualTo(withLinus);
		assertThat(results.get(1).get("conversationId").asString()).isEqualTo(engines);
		assertThat(results.get(2).get("messageId").asString()).isEqualTo(first);
		assertThat(results.get(2).get("conversationId").asString()).isEqualTo(withGrace);
		assertThat(results.get(2).get("seq").asLong()).isEqualTo(1);
		assertThat(results.get(2).get("senderId").asString()).isEqualTo(grace.id());
		assertThat(results.get(2).get("snippet").asString()).isEqualTo(START + "plan" + END + " for monday");
	}

	@Test
	void conversationsOfOtherPeopleAreNeverSearched() throws Exception {
		var theirs = direct(grace, linus);
		say(grace, theirs, "secret plan");
		var ours = direct(ada, grace);
		say(grace, ours, "open plan");

		assertThat(found(ada, "plan")).containsExactly("open plan");
	}

	@Test
	void aConversationSomeoneLeftOrWasRemovedFromIsNoLongerSearched() throws Exception {
		var engines = group("Engines", grace, linus);
		say(ada, engines, "the engine plan");
		var withAda = direct(grace, ada);
		say(ada, withAda, "a private plan");
		client.leave(grace.accessToken(), engines).andExpect(status().isNoContent());
		client.removeParticipant(ada.accessToken(), engines, linus.id()).andExpect(status().isNoContent());

		assertThat(found(grace, "plan")).containsExactly("a private plan");
		assertThat(found(linus, "plan")).isEmpty();
		assertThat(found(ada, "plan")).containsExactly("a private plan", "the engine plan");
	}

	@Test
	void someoneAddedBackFindsOnlyWhatWasSaidAfterTheyRejoined() throws Exception {
		var engines = group("Engines", grace, linus);
		say(ada, engines, "plan before");
		client.removeParticipant(ada.accessToken(), engines, linus.id()).andExpect(status().isNoContent());
		say(ada, engines, "plan while away");
		client.addParticipant(ada.accessToken(), engines, linus.id()).andExpect(status().isOk());
		say(grace, engines, "plan after");

		assertThat(found(linus, "plan")).containsExactly("plan after");
	}

	@Test
	void eachConversationKeepsItsOwnJoinPoint() throws Exception {
		var engines = group("Engines", grace);
		say(ada, engines, "plan before linus");
		client.addParticipant(ada.accessToken(), engines, linus.id()).andExpect(status().isOk());
		say(grace, engines, "plan after linus");
		var withAda = direct(linus, ada);
		say(ada, withAda, "plan from the start");

		assertThat(found(linus, "plan")).containsExactly("plan from the start", "plan after linus");
	}

	@Test
	void hiddenAndDeletedMessagesAreNotFoundInAnyConversation() throws Exception {
		var withGrace = direct(ada, grace);
		var withLinus = direct(ada, linus);
		var hidden = say(grace, withGrace, "hidden plan");
		var deleted = say(linus, withLinus, "deleted plan");
		say(linus, withLinus, "kept plan");
		client.hideMessage(ada.accessToken(), withGrace, hidden).andExpect(status().isNoContent());
		client.deleteMessage(linus.accessToken(), withLinus, deleted).andExpect(status().isNoContent());

		assertThat(found(ada, "plan")).containsExactly("kept plan");
		assertThat(found(grace, "plan")).containsExactly("hidden plan"); // hidden only for ada
	}

	@Test
	void resultsPageAcrossConversationsWithACursor() throws Exception {
		var withGrace = direct(ada, grace);
		var withLinus = direct(ada, linus);
		for (int i = 1; i <= 25; i++) {
			say(i % 2 == 0 ? grace : linus, i % 2 == 0 ? withGrace : withLinus, "note " + i);
		}

		var first = search(ada, "note", null);
		assertThat(numbers(first)).isEqualTo(descending(25, 6));
		assertThat(first.get("hasMore").asBoolean()).isTrue();

		var second = search(ada, "note", last(first));
		assertThat(numbers(second)).isEqualTo(descending(5, 1));
		assertThat(second.get("hasMore").asBoolean()).isFalse();
	}

	@Test
	void aCursorFromAConversationTheCallerIsNotInIsRefused() throws Exception {
		var theirs = direct(grace, linus);
		var elsewhere = say(grace, theirs, "note");

		client.searchAll(ada.accessToken(), "note", elsewhere).andExpect(status().isBadRequest());
		client.searchAll(ada.accessToken(), "note", UUID.randomUUID().toString()).andExpect(status().isBadRequest());
	}

	@Test
	void theQueryRulesAreTheSame() throws Exception {
		for (var bad : List.of("", "a", "x".repeat(101))) {
			client.searchAll(ada.accessToken(), bad, null).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.q").isNotEmpty());
		}
		client.searchAll(ada.accessToken(), "' or 1=1 --", null).andExpect(status().isOk());
		client.searchAll("not-a-jwt", "plan", null).andExpect(status().isUnauthorized());
	}

	@Test
	void bothKindsOfSearchShareOneAllowanceOfThirtyAMinute() throws Exception {
		var withGrace = direct(ada, grace);
		for (int i = 0; i < 15; i++) {
			client.searchAll(ada.accessToken(), "anything", null).andExpect(status().isOk());
			client.searchConversation(ada.accessToken(), withGrace, "anything", null).andExpect(status().isOk());
		}

		client.searchAll(ada.accessToken(), "anything", null).andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
	}

	private static List<Integer> numbers(JsonNode page) {
		var numbers = new ArrayList<Integer>();
		page.get("results").forEach(r -> numbers.add(
				Integer.parseInt(r.get("snippet").asString().replace(START, "").replace(END, "").replace("note ", ""))));
		return numbers;
	}

	private static String last(JsonNode page) {
		var results = page.get("results");
		return results.get(results.size() - 1).get("messageId").asString();
	}

	private static List<Integer> descending(int from, int to) {
		var list = new ArrayList<Integer>();
		for (int i = from; i >= to; i--) {
			list.add(i);
		}
		return list;
	}

}
