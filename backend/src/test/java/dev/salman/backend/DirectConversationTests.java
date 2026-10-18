package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
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

class DirectConversationTests extends IntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;

	@BeforeEach
	void twoAccounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
	}

	private String idFrom(org.springframework.test.web.servlet.ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString()).get("id").asString();
	}

	@Test
	void startingAConversationCreatesItWithBothParticipantsAndNoPrivateDetails() throws Exception {
		client.startDirect(ada.accessToken(), grace.id())
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.type").value("DIRECT"))
				.andExpect(jsonPath("$.name").doesNotExist())
				.andExpect(jsonPath("$.participants.length()").value(2))
				.andExpect(jsonPath("$.participants[?(@.userId=='%s')].displayName", ada.id()).value("Ada Lovelace"))
				.andExpect(jsonPath("$.participants[?(@.userId=='%s')].displayName", grace.id()).value("Grace Hopper"))
				.andExpect(jsonPath("$.participants[*].email").doesNotExist())
				.andExpect(jsonPath("$.directKey").doesNotExist());
	}

	@Test
	void startingAgainReturnsTheSameConversationWhoeverStartsIt() throws Exception {
		var created = client.startDirect(ada.accessToken(), grace.id()).andExpect(status().isCreated());
		var id = idFrom(created);

		var again = client.startDirect(ada.accessToken(), grace.id()).andExpect(status().isOk());
		var fromTheOtherSide = client.startDirect(grace.accessToken(), ada.id()).andExpect(status().isOk());

		assertThat(idFrom(again)).isEqualTo(id);
		assertThat(idFrom(fromTheOtherSide)).isEqualTo(id);
		client.conversations(ada.accessToken()).andExpect(jsonPath("$.length()").value(1));
		client.conversations(grace.accessToken()).andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void aConversationWithYourselfIsRefused() throws Exception {
		client.startDirect(ada.accessToken(), ada.id())
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsStringIgnoringCase("yourself")));

		client.conversations(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void unknownAndUnverifiedUsersAreRefusedIdentically() throws Exception {
		var unverifiedEmail = AuthClient.uniqueEmail();
		client.signUp(unverifiedEmail, "Not Yet", AuthClient.PASSWORD).andExpect(status().isAccepted());
		var unverifiedLoginAttempt = client.login(unverifiedEmail, AuthClient.PASSWORD).andExpect(status().isForbidden());
		assertThat(unverifiedLoginAttempt).isNotNull();

		var unknown = client.startDirect(ada.accessToken(), UUID.randomUUID().toString())
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andReturn().getResponse().getContentAsString();

		assertThat(json.readTree(unknown).get("status").asInt()).isEqualTo(404);
		client.conversations(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void aMissingOrMalformedUserIdIsAValidationError() throws Exception {
		client.startDirect(ada.accessToken(), "not-a-uuid").andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/conversations/direct").contentType(MediaType.APPLICATION_JSON).content("{}")
				.header("Authorization", "Bearer " + ada.accessToken()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.userId").isNotEmpty());
	}

	@Test
	void whenBothUsersStartTheConversationAtOnceExactlyOneIsCreated() throws Exception {
		for (int round = 0; round < 5; round++) {
			var a = client.account("Racer A");
			var b = client.account("Racer B");

			var tasks = new ArrayList<Callable<String>>();
			for (int i = 0; i < 3; i++) {
				tasks.add(() -> describe(client.startDirect(a.accessToken(), b.id())));
				tasks.add(() -> describe(client.startDirect(b.accessToken(), a.id())));
			}
			List<String> results;
			try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
				var futures = tasks.stream().map(executor::submit).toList();
				results = new ArrayList<>();
				for (var future : futures) {
					results.add(future.get());
				}
			}

			assertThat(results.stream().filter(r -> r.startsWith("201")).count()).as("created").isEqualTo(1);
			assertThat(results.stream().filter(r -> r.startsWith("200")).count()).as("existing").isEqualTo(5);
			assertThat(results.stream().map(r -> r.substring(4)).distinct()).as("one conversation id").hasSize(1);
			client.conversations(a.accessToken()).andExpect(jsonPath("$.length()").value(1));
			client.conversations(b.accessToken()).andExpect(jsonPath("$.length()").value(1));
		}
	}

	private String describe(org.springframework.test.web.servlet.ResultActions result) throws Exception {
		var response = result.andReturn().getResponse();
		return response.getStatus() + " " + json.readTree(response.getContentAsString()).get("id").asString();
	}

	@Test
	void theListContainsOnlyTheCallersConversations() throws Exception {
		var linus = client.account("Linus Torvalds");
		var outsider = client.account("Outsider");
		var adaGrace = idFrom(client.startDirect(ada.accessToken(), grace.id()));
		var adaLinus = idFrom(client.startDirect(ada.accessToken(), linus.id()));
		var graceLinus = idFrom(client.startDirect(grace.accessToken(), linus.id()));

		var adaIds = ids(client.conversations(ada.accessToken()));
		var graceIds = ids(client.conversations(grace.accessToken()));
		var linusIds = ids(client.conversations(linus.accessToken()));

		assertThat(adaIds).containsExactlyInAnyOrder(adaGrace, adaLinus);
		assertThat(graceIds).containsExactlyInAnyOrder(adaGrace, graceLinus);
		assertThat(linusIds).containsExactlyInAnyOrder(adaLinus, graceLinus);
		client.conversations(outsider.accessToken()).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	private List<String> ids(org.springframework.test.web.servlet.ResultActions result) throws Exception {
		var ids = new ArrayList<String>();
		json.readTree(result.andReturn().getResponse().getContentAsString())
				.forEach(node -> ids.add(node.get("id").asString()));
		return ids;
	}

	@Test
	void theListShowsTheMostRecentlyActiveConversationFirst() throws Exception {
		var linus = client.account("Linus Torvalds");
		var first = idFrom(client.startDirect(ada.accessToken(), grace.id()));
		clock.advance(Duration.ofMinutes(5));
		var second = idFrom(client.startDirect(ada.accessToken(), linus.id()));

		assertThat(ids(client.conversations(ada.accessToken()))).containsExactly(second, first);
	}

	@Test
	void eachListEntryShowsWhoIsInTheConversation() throws Exception {
		client.startDirect(ada.accessToken(), grace.id()).andExpect(status().isCreated());

		client.conversations(grace.accessToken())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].type").value("DIRECT"))
				.andExpect(jsonPath("$[0].participants.length()").value(2))
				.andExpect(jsonPath("$[0].participants[?(@.userId=='%s')].displayName", ada.id()).value("Ada Lovelace"));
	}

	@Test
	void bothEndpointsRequireAuthentication() throws Exception {
		mvc.perform(get("/api/v1/conversations")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/v1/conversations/direct").contentType(MediaType.APPLICATION_JSON)
				.content("{\"userId\":\"%s\"}".formatted(grace.id()))).andExpect(status().isUnauthorized());
	}

}
