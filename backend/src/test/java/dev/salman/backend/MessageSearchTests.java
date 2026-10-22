package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

/** Searching the Messages of one Conversation: matching, exclusions, paging and limits. */
class MessageSearchTests extends IntegrationTest {

	/** How the server marks the matched words in a snippet. */
	private static final String START = "";
	private static final String END = "";

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String direct;

	@BeforeEach
	void aDirectConversation() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		direct = idOf(client.startDirect(ada.accessToken(), grace.id()).andReturn().getResponse().getContentAsString());
	}

	private String idOf(String body) {
		return json.readTree(body).get("id").asString();
	}

	private String say(Account who, String conversation, String text) throws Exception {
		return client.sendNew(who.accessToken(), conversation, text).get("id").asString();
	}

	private JsonNode search(Account who, String conversation, String q, String before) throws Exception {
		return json.readTree(client.searchConversation(who.accessToken(), conversation, q, before)
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
	}

	/** The texts of the Messages found, newest first, read back from the history so the snippet is not relied on. */
	private List<String> found(Account who, String conversation, String q) throws Exception {
		var ids = new ArrayList<String>();
		search(who, conversation, q, null).get("results").forEach(r -> ids.add(r.get("messageId").asString()));
		var texts = new java.util.HashMap<String, String>();
		json.readTree(client.history(who.accessToken(), conversation, "afterSeq=0&limit=100").andReturn().getResponse()
				.getContentAsString()).get("messages").forEach(m -> texts.put(m.get("id").asString(),
						m.get("body").isNull() ? null : m.get("body").asString()));
		return ids.stream().map(texts::get).toList();
	}

	private String group(String name, Account... others) throws Exception {
		var ids = java.util.Arrays.stream(others).map(Account::id).toArray();
		return idOf(client.createGroup(ada.accessToken(), name, ids).andReturn().getResponse().getContentAsString());
	}

	@Test
	void matchingIgnoresCaseAndAccents() throws Exception {
		say(ada, direct, "Meet at the Café tomorrow");
		say(grace, direct, "Nothing to see here");

		assertThat(found(ada, direct, "cafe")).containsExactly("Meet at the Café tomorrow");
		assertThat(found(ada, direct, "CAFÉ")).containsExactly("Meet at the Café tomorrow");
		assertThat(found(grace, direct, "meet TOMORROW")).containsExactly("Meet at the Café tomorrow");
	}

	@Test
	void theLastWordMatchesAsAPrefixWhileEarlierWordsMatchWhole() throws Exception {
		say(ada, direct, "the meeting moved to Friday");

		assertThat(found(ada, direct, "meet")).containsExactly("the meeting moved to Friday");
		assertThat(found(ada, direct, "moved fri")).containsExactly("the meeting moved to Friday");
		assertThat(found(ada, direct, "meet moved")).isEmpty(); // "meet" is not the last word, so it must be whole
	}

	@Test
	void wordsAreNeverCutDownToAStemInAnyLanguage() throws Exception {
		say(ada, direct, "one meeting only");
		say(ada, direct, "Встреча завтра в офисе");
		say(grace, direct, "Καλημέρα από την Αθήνα");
		say(grace, direct, "Die Straße ist naß");
		say(ada, direct, "明日の会議は十時");

		assertThat(found(ada, direct, "meetings")).isEmpty(); // an English stemmer would have matched it
		assertThat(found(ada, direct, "ВСТРЕ")).containsExactly("Встреча завтра в офисе");
		assertThat(found(ada, direct, "встреча офис")).containsExactly("Встреча завтра в офисе");
		assertThat(found(ada, direct, "καλημερα")).containsExactly("Καλημέρα από την Αθήνα");
		assertThat(found(ada, direct, "strasse")).containsExactly("Die Straße ist naß");
		assertThat(found(ada, direct, "明日")).containsExactly("明日の会議は十時");
	}

	@Test
	void anyQueryTextIsSafeAndOddOnesSimplyFindNothing() throws Exception {
		say(ada, direct, "Meet at the Café");

		for (var hostile : List.of("''", "\"\"", "\\\\", ":*", "&|!", "<->", "(((", "--", "' or 1=1 --", "%_",
				"a:*b", "!!", "\"unbalanced", "́́", "🙂🙂", "meet & | ! :* <->", "'; drop table message; --",
				"x".repeat(100))) {
			client.searchConversation(ada.accessToken(), direct, hostile, null).andExpect(status().isOk());
		}
		assertThat(found(ada, direct, "\"meet at\"")).containsExactly("Meet at the Café");
		assertThat(found(ada, direct, "meet -cafe")).isEmpty();
	}

	@Test
	void orFindsEitherWord() throws Exception {
		say(ada, direct, "lunch at noon");
		say(grace, direct, "dinner at seven");
		say(ada, direct, "breakfast at eight");

		assertThat(found(ada, direct, "lunch or dinner")).containsExactly("dinner at seven", "lunch at noon");
		assertThat(found(ada, direct, "lunch OR dinner -seven")).containsExactly("lunch at noon");
	}

	@Test
	void aQueryThatOnlyExcludesFindsNothingNotEverythingElse() throws Exception {
		say(ada, direct, "Meet at the Café");
		say(grace, direct, "something else entirely");
		var picture = json.readTree(client.uploadImage(ada.accessToken(), "a.png", "image/png",
				UploadImageTests.image("png", 64, 48)).andReturn().getResponse().getContentAsString()).get("id")
				.asString();
		client.sendBody(ada.accessToken(), direct, Map.of("clientMessageId", UUID.randomUUID().toString(),
				"attachmentId", picture)).andExpect(status().isCreated());

		assertThat(search(ada, direct, "-cafe", null).get("results")).isEmpty();
		assertThat(search(ada, direct, "-cafe -meet", null).get("results")).isEmpty();
	}

	@Test
	void theSnippetMarksWhatMatchedInTheTextAsSent() throws Exception {
		say(ada, direct, "Meet at the Café tomorrow");

		var result = search(ada, direct, "cafe", null).get("results").get(0);

		assertThat(result.get("snippet").asString()).isEqualTo("Meet at the " + START + "Café" + END + " tomorrow");
	}

	@Test
	void aLongMessageGivesAShortSnippetFromAboutTheMatch() throws Exception {
		var words = new StringBuilder();
		for (int i = 0; i < 150; i++) { // about 1700 characters each side, inside the 4000 allowed
			words.append("filler").append(i).append(' ');
		}
		say(ada, direct, words + "the needle is here " + words);

		var snippet = search(ada, direct, "needle", null).get("results").get(0).get("snippet").asString();

		assertThat(snippet).contains(START + "needle" + END);
		assertThat(snippet.split(" ").length).isLessThan(40);
	}

	@Test
	void aNumberAtTheEndOfTheTextStaysInTheSnippet() throws Exception {
		say(ada, direct, "see you at 5");
		say(grace, direct, "note 12");

		assertThat(search(ada, direct, "see", null).get("results").get(0).get("snippet").asString())
				.isEqualTo(START + "see" + END + " you at 5");
		assertThat(search(ada, direct, "note", null).get("results").get(0).get("snippet").asString())
				.isEqualTo(START + "note" + END + " 12");
	}

	@Test
	void someoneWhoTypedTheMarkersCannotFakeAMatch() throws Exception {
		say(ada, direct, "a " + START + "fake" + END + " mark and a real word");

		var snippet = search(ada, direct, "real", null).get("results").get(0).get("snippet").asString();

		assertThat(snippet).isEqualTo("a fake mark and a " + START + "real" + END + " word");
	}

	@Test
	void eachResultSaysWhichMessageItIsAndWhen() throws Exception {
		var id = say(grace, direct, "find me");

		var result = search(ada, direct, "find", null).get("results").get(0);

		assertThat(result.get("messageId").asString()).isEqualTo(id);
		assertThat(result.get("conversationId").asString()).isEqualTo(direct);
		assertThat(result.get("seq").asLong()).isEqualTo(1);
		assertThat(result.get("senderId").asString()).isEqualTo(grace.id());
		assertThat(result.get("createdAt").asString()).isNotBlank();
	}

	@Test
	void captionsAreSearchableAndAPictureAloneIsNot() throws Exception {
		var picture = json.readTree(client.uploadImage(ada.accessToken(), "a.png", "image/png",
				UploadImageTests.image("png", 64, 48)).andExpect(status().isCreated()).andReturn().getResponse()
				.getContentAsString()).get("id").asString();
		client.sendBody(ada.accessToken(), direct, Map.of("clientMessageId", UUID.randomUUID().toString(), "body",
				"sunset at the pier", "attachmentId", picture)).andExpect(status().isCreated());
		var alone = json.readTree(client.uploadImage(ada.accessToken(), "b.png", "image/png",
				UploadImageTests.image("png", 64, 48)).andReturn().getResponse().getContentAsString()).get("id")
				.asString();
		client.sendBody(ada.accessToken(), direct, Map.of("clientMessageId", UUID.randomUUID().toString(),
				"attachmentId", alone)).andExpect(status().isCreated());

		assertThat(found(grace, direct, "pier")).containsExactly("sunset at the pier");
		assertThat(search(grace, direct, "png", null).get("results")).isEmpty();
	}

	@Test
	void anEditedMessageIsFoundByItsNewTextOnly() throws Exception {
		var id = say(ada, direct, "lunch at noon");
		client.editMessage(ada.accessToken(), direct, id, "dinner at seven").andExpect(status().isOk());

		assertThat(found(grace, direct, "lunch")).isEmpty();
		assertThat(found(grace, direct, "dinner")).containsExactly("dinner at seven");
	}

	@Test
	void aMessageDeletedForEveryoneIsNeverFound() throws Exception {
		var id = say(ada, direct, "secret plans");
		client.deleteMessage(ada.accessToken(), direct, id).andExpect(status().isNoContent());

		assertThat(search(grace, direct, "secret", null).get("results")).isEmpty();
		assertThat(search(ada, direct, "secret", null).get("results")).isEmpty();
	}

	@Test
	void aMessageHiddenForMeIsNotFoundByMeButIsByOthers() throws Exception {
		var id = say(grace, direct, "hidden treasure");
		client.hideMessage(ada.accessToken(), direct, id).andExpect(status().isNoContent());

		assertThat(search(ada, direct, "treasure", null).get("results")).isEmpty();
		assertThat(found(grace, direct, "treasure")).containsExactly("hidden treasure");
	}

	@Test
	void nothingFromBeforeIJoinedIsFound() throws Exception {
		var linus = client.account("Linus");
		var engines = group("Engines", grace);
		say(ada, engines, "before linus joined");
		client.addParticipant(ada.accessToken(), engines, linus.id()).andExpect(status().isOk());
		say(grace, engines, "after linus joined");

		var forLinus = new ArrayList<String>();
		search(linus, engines, "linus joined", null).get("results")
				.forEach(r -> forLinus.add(r.get("seq").asString()));
		assertThat(forLinus).containsExactly("2");
		assertThat(search(ada, engines, "linus joined", null).get("results")).hasSize(2);
	}

	@Test
	void someoneWhoLeftOrWasRemovedFindsNothingAndGetsTheUniformNotFound() throws Exception {
		var linus = client.account("Linus");
		var engines = group("Engines", grace, linus);
		say(ada, engines, "the plan for engines");
		client.leave(grace.accessToken(), engines).andExpect(status().isNoContent());
		client.removeParticipant(ada.accessToken(), engines, linus.id()).andExpect(status().isNoContent());

		client.searchConversation(grace.accessToken(), engines, "plan", null).andExpect(status().isNotFound());
		client.searchConversation(linus.accessToken(), engines, "plan", null).andExpect(status().isNotFound());
	}

	@Test
	void someoneOutsideTheConversationGetsTheUniformNotFound() throws Exception {
		say(ada, direct, "the plan");
		var outsider = client.account("Outsider");

		var unknown = client.searchConversation(outsider.accessToken(), UUID.randomUUID().toString(), "plan", null)
				.andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		var foreign = client.searchConversation(outsider.accessToken(), direct, "plan", null)
				.andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
		assertThat(json.readTree(foreign).get("detail")).isEqualTo(json.readTree(unknown).get("detail"));
	}

	@Test
	void resultsComeNewestFirstTwentyAtATimeWithACursor() throws Exception {
		for (int i = 1; i <= 45; i++) {
			say(i % 2 == 0 ? grace : ada, direct, "note " + i);
		}
		say(ada, direct, "unrelated");

		var first = search(ada, direct, "note", null);
		assertThat(seqs(first)).isEqualTo(descending(45, 26));
		assertThat(first.get("hasMore").asBoolean()).isTrue();

		var second = search(ada, direct, "note", last(first));
		assertThat(seqs(second)).isEqualTo(descending(25, 6));
		assertThat(second.get("hasMore").asBoolean()).isTrue();

		var third = search(ada, direct, "note", last(second));
		assertThat(seqs(third)).isEqualTo(descending(5, 1));
		assertThat(third.get("hasMore").asBoolean()).isFalse();
	}

	@Test
	void exactlyTwentyResultsSayThereIsNoMore() throws Exception {
		for (int i = 1; i <= 20; i++) {
			say(i % 2 == 0 ? grace : ada, direct, "note " + i);
		}

		var page = search(ada, direct, "note", null);

		assertThat(page.get("results")).hasSize(20);
		assertThat(page.get("hasMore").asBoolean()).isFalse();
	}

	@Test
	void aCursorThatIsNotAMessageOfThisConversationIsRefused() throws Exception {
		say(ada, direct, "note");
		var other = group("Elsewhere", grace);
		var elsewhere = say(ada, other, "note");

		client.searchConversation(ada.accessToken(), direct, "note", elsewhere).andExpect(status().isBadRequest());
		client.searchConversation(ada.accessToken(), direct, "note", UUID.randomUUID().toString())
				.andExpect(status().isBadRequest());
		client.searchConversation(ada.accessToken(), direct, "note", "not-a-uuid").andExpect(status().isBadRequest());
	}

	@Test
	void blankOneCharacterAndOverlongQueriesAreRefused() throws Exception {
		for (var bad : List.of("", "   ", "a", " é ", "🙂", "x".repeat(101), "a\u0000b")) {
			client.searchConversation(ada.accessToken(), direct, bad, null).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.q").isNotEmpty());
		}
		client.searchConversation(ada.accessToken(), direct, "🙂".repeat(100), null).andExpect(status().isOk());
		client.searchConversation(ada.accessToken(), direct, "ab", null).andExpect(status().isOk());
	}

	@Test
	void searchingIsLimitedToThirtyAMinutePerUser() throws Exception {
		var other = group("Elsewhere", grace);
		for (int i = 0; i < 30; i++) {
			// Every call counts, whichever Conversation it searches and whether it finds anything.
			client.searchConversation(ada.accessToken(), i % 2 == 0 ? direct : other, "anything", null)
					.andExpect(status().isOk());
		}

		client.searchConversation(ada.accessToken(), direct, "anything", null)
				.andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
		client.searchConversation(grace.accessToken(), direct, "anything", null).andExpect(status().isOk());
	}

	@Test
	void searchingNeedsASignedInUser() throws Exception {
		client.searchConversation("not-a-jwt", direct, "plan", null).andExpect(status().isUnauthorized());
	}

	private static List<Integer> seqs(JsonNode page) {
		var seqs = new ArrayList<Integer>();
		page.get("results").forEach(r -> seqs.add(r.get("seq").asInt()));
		return seqs;
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
