package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

class GroupTests extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private Account outsider;

	@BeforeEach
	void fourAccounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		outsider = client.account("Outsider");
	}

	private String idOf(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString()).get("id").asString();
	}

	/** Ada creates a group with Grace and Linus. */
	private String trio() throws Exception {
		return idOf(client.createGroup(ada.accessToken(), "Pioneers", grace.id(), linus.id())
				.andExpect(status().isCreated()));
	}

	private String roleOf(String viewerToken, String conversationId, Account who) throws Exception {
		var conversation = json.readTree(client.conversation(viewerToken, conversationId).andReturn().getResponse()
				.getContentAsString());
		for (var participant : conversation.get("participants")) {
			if (participant.get("userId").asString().equals(who.id())) {
				return participant.get("role").asString();
			}
		}
		return null;
	}

	private List<String> participantIds(String viewerToken, String conversationId) throws Exception {
		var ids = new ArrayList<String>();
		json.readTree(client.conversation(viewerToken, conversationId).andReturn().getResponse().getContentAsString())
				.get("participants").forEach(p -> ids.add(p.get("userId").asString()));
		return ids;
	}

	private List<Integer> seqs(Account viewer, String conversationId, String query) throws Exception {
		var page = json.readTree(client.history(viewer.accessToken(), conversationId, query).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString());
		var seqs = new ArrayList<Integer>();
		page.get("messages").forEach(m -> seqs.add(m.get("seq").asInt()));
		return seqs;
	}

	// ---- creating

	@Test
	void creatingAGroupMakesTheCreatorAdminAndTheOthersMembers() throws Exception {
		client.createGroup(ada.accessToken(), "Pioneers", grace.id(), linus.id())
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.type").value("GROUP"))
				.andExpect(jsonPath("$.name").value("Pioneers"))
				.andExpect(jsonPath("$.participants.length()").value(3))
				.andExpect(jsonPath("$.participants[?(@.userId=='%s')].role", ada.id()).value("ADMIN"))
				.andExpect(jsonPath("$.participants[?(@.userId=='%s')].role", grace.id()).value("MEMBER"))
				.andExpect(jsonPath("$.participants[?(@.userId=='%s')].displayName", linus.id()).value("Linus Torvalds"))
				.andExpect(jsonPath("$.participants[*].email").doesNotExist())
				.andExpect(jsonPath("$.lastMessage").doesNotExist());
	}

	@Test
	void everyMemberSeesTheGroupInTheirListAndOutsidersDoNot() throws Exception {
		var id = trio();

		for (var member : List.of(ada, grace, linus)) {
			client.conversations(member.accessToken()).andExpect(jsonPath("$.length()").value(1))
					.andExpect(jsonPath("$[0].id").value(id)).andExpect(jsonPath("$[0].name").value("Pioneers"));
		}
		client.conversations(outsider.accessToken()).andExpect(jsonPath("$.length()").value(0));
		client.conversation(outsider.accessToken(), id).andExpect(status().isNotFound());
	}

	@Test
	void duplicatesAndTheCreatorsOwnIdInTheListAreIgnored() throws Exception {
		client.createGroup(ada.accessToken(), "Dupes", grace.id(), grace.id(), ada.id())
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.participants.length()").value(2));
	}

	@Test
	void aGroupNeedsANameAndAtLeastOneOtherUserAndBoundedSize() throws Exception {
		client.createGroupBody(ada.accessToken(), java.util.Map.of("name", "   ", "userIds", List.of(grace.id())))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.name").isNotEmpty());
		client.createGroupBody(ada.accessToken(), java.util.Map.of("name", "x".repeat(101), "userIds", List.of(grace.id())))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.name").isNotEmpty());
		client.createGroup(ada.accessToken(), "Alone").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.userIds").isNotEmpty());
		client.createGroup(ada.accessToken(), "Only me", ada.id()).andExpect(status().isBadRequest());
		client.createGroupBody(ada.accessToken(), java.util.Map.of("name", "Huge",
				"userIds", java.util.stream.IntStream.range(0, 256).mapToObj(i -> UUID.randomUUID().toString()).toList()))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.userIds").isNotEmpty());
		client.createGroup(ada.accessToken(), "x".repeat(100), grace.id()).andExpect(status().isCreated());
	}

	@Test
	void anUnknownOrUnverifiedUserFailsTheWholeRequestAndCreatesNothing() throws Exception {
		var unverified = AuthClient.uniqueEmail();
		client.signUp(unverified, "Not Yet", AuthClient.PASSWORD).andExpect(status().isAccepted());

		client.createGroup(ada.accessToken(), "Ghosts", grace.id(), UUID.randomUUID().toString())
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));

		client.conversations(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
		client.conversations(grace.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void groupEndpointsRequireAuthentication() throws Exception {
		var id = trio();
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/v1/conversations/groups").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized());
		client.leave("not-a-jwt", id).andExpect(status().isUnauthorized());
	}

	// ---- renaming

	@Test
	void anAdminCanRenameAndMembersAndOutsidersCannot() throws Exception {
		var id = trio();

		client.rename(ada.accessToken(), id, "Computing Greats").andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Computing Greats"));
		client.conversation(grace.accessToken(), id).andExpect(jsonPath("$.name").value("Computing Greats"));

		client.rename(grace.accessToken(), id, "Mutiny").andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
		client.rename(outsider.accessToken(), id, "Hijack").andExpect(status().isNotFound());
		client.rename(ada.accessToken(), id, "  ").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").isNotEmpty());
		client.conversation(ada.accessToken(), id).andExpect(jsonPath("$.name").value("Computing Greats"));
	}

	@Test
	void aDirectConversationCannotBeRenamedOrLeftOrChanged() throws Exception {
		var direct = idOf(client.startDirect(ada.accessToken(), grace.id()));

		client.rename(ada.accessToken(), direct, "Nope").andExpect(status().isBadRequest());
		client.leave(ada.accessToken(), direct).andExpect(status().isBadRequest());
		client.addParticipant(ada.accessToken(), direct, linus.id()).andExpect(status().isBadRequest());
		client.removeParticipant(ada.accessToken(), direct, grace.id()).andExpect(status().isBadRequest());
		client.conversation(grace.accessToken(), direct).andExpect(jsonPath("$.participants.length()").value(2));
	}

	// ---- adding

	@Test
	void anAdminCanAddAVerifiedUserWhoThenSeesTheGroup() throws Exception {
		var id = trio();

		client.addParticipant(ada.accessToken(), id, outsider.id()).andExpect(status().isOk())
				.andExpect(jsonPath("$.participants.length()").value(4))
				.andExpect(jsonPath("$.participants[?(@.userId=='%s')].role", outsider.id()).value("MEMBER"));

		client.conversations(outsider.accessToken()).andExpect(jsonPath("$[0].id").value(id));
	}

	@Test
	void addingIsRefusedForMembersOutsidersExistingMembersAndUnknownUsers() throws Exception {
		var id = trio();
		var newcomer = client.account("Newcomer");

		client.addParticipant(grace.accessToken(), id, newcomer.id()).andExpect(status().isForbidden());
		client.addParticipant(outsider.accessToken(), id, newcomer.id()).andExpect(status().isNotFound());
		client.addParticipant(ada.accessToken(), id, grace.id()).andExpect(status().isConflict());
		client.addParticipant(ada.accessToken(), id, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		client.addParticipant(ada.accessToken(), id, "not-a-uuid").andExpect(status().isBadRequest());

		assertThat(participantIds(ada.accessToken(), id)).hasSize(3).doesNotContain(newcomer.id());
	}

	@Test
	void aGroupHoldsAtMostTwoHundredFiftySixParticipants() throws Exception {
		var many = new ArrayList<Object>();
		for (int i = 0; i < 255; i++) {
			many.add(insertVerifiedUser());
		}
		var id = idOf(client.createGroupBody(ada.accessToken(), java.util.Map.of("name", "Big", "userIds", many))
				.andExpect(status().isCreated()));

		client.addParticipant(ada.accessToken(), id, grace.id()).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsStringIgnoringCase("full")));
	}

	private String insertVerifiedUser() {
		var id = UUID.randomUUID();
		jdbc.update("insert into users (id, email, display_name, password_hash, email_verified) values (?, ?, 'Bulk', 'x', true)",
				id, "bulk-" + id + "@example.com");
		return id.toString();
	}

	@Test
	void aNewParticipantCannotReadMessagesFromBeforeTheyJoined() throws Exception {
		var id = trio();
		for (int i = 1; i <= 5; i++) {
			client.sendNew(i % 2 == 0 ? grace.accessToken() : ada.accessToken(), id, "before " + i);
		}

		client.addParticipant(ada.accessToken(), id, outsider.id()).andExpect(status().isOk());

		assertThat(seqs(outsider, id, "")).isEmpty();
		client.history(outsider.accessToken(), id, "").andExpect(jsonPath("$.hasMore").value(false));
		client.conversations(outsider.accessToken()).andExpect(jsonPath("$[0].lastMessage").doesNotExist());
		assertThat(seqs(outsider, id, "afterSeq=0")).isEmpty();
		assertThat(seqs(outsider, id, "beforeSeq=1000")).isEmpty();

		client.sendNew(grace.accessToken(), id, "after 1");
		client.sendNew(ada.accessToken(), id, "after 2");

		assertThat(seqs(outsider, id, "")).containsExactly(6, 7);
		assertThat(seqs(outsider, id, "afterSeq=0")).containsExactly(6, 7);
		assertThat(seqs(outsider, id, "beforeSeq=1000")).containsExactly(6, 7);
		assertThat(seqs(outsider, id, "beforeSeq=7")).containsExactly(6);
		client.history(outsider.accessToken(), id, "beforeSeq=7&limit=1").andExpect(jsonPath("$.hasMore").value(false));
		client.conversations(outsider.accessToken()).andExpect(jsonPath("$[0].lastMessage.body").value("after 2"));
		assertThat(seqs(ada, id, "")).containsExactly(1, 2, 3, 4, 5, 6, 7);
	}

	// ---- removing

	@Test
	void anAdminCanRemoveAMemberWhoThenLosesAllAccess() throws Exception {
		var id = trio();
		client.sendNew(grace.accessToken(), id, "from grace before");

		client.removeParticipant(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent());

		client.history(grace.accessToken(), id, "").andExpect(status().isNotFound());
		client.send(grace.accessToken(), id, UUID.randomUUID().toString(), "still here?").andExpect(status().isNotFound());
		client.conversation(grace.accessToken(), id).andExpect(status().isNotFound());
		client.conversations(grace.accessToken()).andExpect(jsonPath("$.length()").value(0));
		assertThat(participantIds(ada.accessToken(), id)).containsExactlyInAnyOrder(ada.id(), linus.id());
		assertThat(seqs(linus, id, "")).containsExactly(1);
	}

	@Test
	void removingIsRefusedForMembersOutsidersYourselfAndNonMembers() throws Exception {
		var id = trio();

		client.removeParticipant(grace.accessToken(), id, linus.id()).andExpect(status().isForbidden());
		client.removeParticipant(outsider.accessToken(), id, linus.id()).andExpect(status().isNotFound());
		client.removeParticipant(ada.accessToken(), id, ada.id()).andExpect(status().isBadRequest());
		client.removeParticipant(ada.accessToken(), id, outsider.id()).andExpect(status().isNotFound());

		assertThat(participantIds(ada.accessToken(), id)).hasSize(3);
	}

	@Test
	void anAdminCanRemoveAnotherAdmin() throws Exception {
		var id = trio();
		client.promote(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent());

		client.removeParticipant(grace.accessToken(), id, ada.id()).andExpect(status().isNoContent());

		assertThat(participantIds(grace.accessToken(), id)).containsExactlyInAnyOrder(grace.id(), linus.id());
	}

	@Test
	void aRemovedUserWhoIsAddedAgainGetsAFreshJoinPoint() throws Exception {
		var id = trio();
		client.sendNew(ada.accessToken(), id, "one");
		client.sendNew(ada.accessToken(), id, "two");
		client.removeParticipant(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent());
		client.sendNew(ada.accessToken(), id, "three");

		client.addParticipant(ada.accessToken(), id, grace.id()).andExpect(status().isOk());
		client.sendNew(ada.accessToken(), id, "four");

		assertThat(seqs(grace, id, "")).containsExactly(4);
	}

	// ---- promoting

	@Test
	void anAdminCanPromoteAMemberAndThePromotedAdminCanManage() throws Exception {
		var id = trio();

		client.promote(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent());

		assertThat(roleOf(ada.accessToken(), id, grace)).isEqualTo("ADMIN");
		client.rename(grace.accessToken(), id, "Run by Grace").andExpect(status().isOk());
		client.promote(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent()); // already an admin
		assertThat(roleOf(ada.accessToken(), id, grace)).isEqualTo("ADMIN");
		assertThat(roleOf(ada.accessToken(), id, linus)).isEqualTo("MEMBER");
	}

	@Test
	void promotingIsRefusedForMembersOutsidersAndNonMembers() throws Exception {
		var id = trio();

		client.promote(grace.accessToken(), id, linus.id()).andExpect(status().isForbidden());
		client.promote(outsider.accessToken(), id, linus.id()).andExpect(status().isNotFound());
		client.promote(ada.accessToken(), id, outsider.id()).andExpect(status().isNotFound());
		assertThat(roleOf(ada.accessToken(), id, linus)).isEqualTo("MEMBER");
	}

	// ---- leaving

	@Test
	void aMemberCanLeaveAndThenHasNoAccessWhileOthersCarryOn() throws Exception {
		var id = trio();
		client.sendNew(linus.accessToken(), id, "bye soon");

		client.leave(linus.accessToken(), id).andExpect(status().isNoContent());

		client.history(linus.accessToken(), id, "").andExpect(status().isNotFound());
		client.send(linus.accessToken(), id, UUID.randomUUID().toString(), "back?").andExpect(status().isNotFound());
		client.leave(linus.accessToken(), id).andExpect(status().isNotFound());
		assertThat(participantIds(ada.accessToken(), id)).containsExactlyInAnyOrder(ada.id(), grace.id());
		assertThat(seqs(grace, id, "")).containsExactly(1);
	}

	@Test
	void whenTheLastAdminLeavesTheLongestStandingMemberBecomesAdmin() throws Exception {
		var id = trio(); // grace and linus joined at creation
		clock.advance(Duration.ofMinutes(5));
		client.addParticipant(ada.accessToken(), id, outsider.id()).andExpect(status().isOk());

		client.leave(ada.accessToken(), id).andExpect(status().isNoContent());

		var adminCount = 0;
		for (var member : List.of(grace, linus, outsider)) {
			if ("ADMIN".equals(roleOf(grace.accessToken(), id, member))) {
				adminCount++;
			}
		}
		assertThat(adminCount).as("exactly one new admin").isEqualTo(1);
		assertThat(roleOf(grace.accessToken(), id, outsider)).as("the newest member is not promoted").isEqualTo("MEMBER");
		client.rename(grace.accessToken(), id, "still managed").andExpect(
				org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is2xxSuccessful());
	}

	@Test
	void anAdminLeavingWhileAnotherAdminRemainsPromotesNobody() throws Exception {
		var id = trio();
		client.promote(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent());

		client.leave(ada.accessToken(), id).andExpect(status().isNoContent());

		assertThat(roleOf(grace.accessToken(), id, grace)).isEqualTo("ADMIN");
		assertThat(roleOf(grace.accessToken(), id, linus)).isEqualTo("MEMBER");
	}

	@Test
	void whenTheLastParticipantLeavesTheGroupAndItsMessagesAreDeleted() throws Exception {
		var id = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()).andExpect(status().isCreated()));
		client.sendNew(ada.accessToken(), id, "hello");
		client.leave(grace.accessToken(), id).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("select count(*) from conversation where id = ?", Long.class,
				UUID.fromString(id))).isEqualTo(1);

		client.leave(ada.accessToken(), id).andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from conversation where id = ?", Long.class,
				UUID.fromString(id))).isZero();
		assertThat(jdbc.queryForObject("select count(*) from message where conversation_id = ?", Long.class,
				UUID.fromString(id))).isZero();
		client.conversations(ada.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	// ---- concurrency

	@Test
	void whenTwoAdminsLeaveAtOnceTheRemainingMemberEndsUpAsAdmin() throws Exception {
		for (int round = 0; round < 5; round++) {
			var a = client.account("A");
			var b = client.account("B");
			var c = client.account("C");
			var id = idOf(client.createGroup(a.accessToken(), "Race", b.id(), c.id()).andExpect(status().isCreated()));
			client.promote(a.accessToken(), id, b.id()).andExpect(status().isNoContent());

			var tasks = new ArrayList<Callable<Integer>>();
			tasks.add(() -> client.leave(a.accessToken(), id).andReturn().getResponse().getStatus());
			tasks.add(() -> client.leave(b.accessToken(), id).andReturn().getResponse().getStatus());
			try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
				for (var future : tasks.stream().map(executor::submit).toList()) {
					assertThat(future.get()).isEqualTo(204);
				}
			}

			assertThat(participantIds(c.accessToken(), id)).containsExactly(c.id());
			assertThat(roleOf(c.accessToken(), id, c)).as("a group is never left without an admin").isEqualTo("ADMIN");
		}
	}

	@Test
	void whenTwoAdminsAddTheSameUserAtOnceExactlyOneSucceeds() throws Exception {
		var id = trio();
		client.promote(ada.accessToken(), id, grace.id()).andExpect(status().isNoContent());

		var tasks = new ArrayList<Callable<Integer>>();
		tasks.add(() -> client.addParticipant(ada.accessToken(), id, outsider.id()).andReturn().getResponse().getStatus());
		tasks.add(() -> client.addParticipant(grace.accessToken(), id, outsider.id()).andReturn().getResponse().getStatus());
		List<Integer> statuses = new ArrayList<>();
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			for (var future : tasks.stream().map(executor::submit).toList()) {
				statuses.add(future.get());
			}
		}

		assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		assertThat(participantIds(ada.accessToken(), id)).hasSize(4);
	}

	@Test
	void aSendThatWaitedOnTheLockWhileTheSenderWasRemovedIsRefused() throws Exception {
		var id = trio();
		var holding = new java.util.concurrent.CountDownLatch(1);
		var release = new java.util.concurrent.CountDownLatch(1);
		// Plays "the admin's removal transaction": takes the conversation lock, removes Grace, commits when released.
		var remover = Thread.ofVirtual().start(() -> new org.springframework.transaction.support.TransactionTemplate(
				transactions).executeWithoutResult(tx -> {
					jdbc.queryForList("select id from conversation where id = ? for update", UUID.fromString(id));
					holding.countDown();
					try {
						release.await();
					}
					catch (InterruptedException e) {
						Thread.currentThread().interrupt();
					}
					jdbc.update("delete from participant where conversation_id = ? and user_id = ?",
							UUID.fromString(id), UUID.fromString(grace.id()));
				}));
		try {
			holding.await();
			var result = new java.util.concurrent.atomic.AtomicInteger();
			var send = Thread.ofVirtual().start(() -> {
				try {
					result.set(client.send(grace.accessToken(), id, UUID.randomUUID().toString(), "racing")
							.andReturn().getResponse().getStatus());
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			});
			// wait until Grace's send is really blocked on the row lock
			for (int i = 0; i < 100 && jdbc.queryForObject(
					"select count(*) from pg_stat_activity where wait_event_type = 'Lock'", Long.class) == 0; i++) {
				Thread.sleep(50);
			}
			release.countDown();
			remover.join();
			send.join();

			assertThat(result.get()).as("the queued send must see the removal").isEqualTo(404);
		}
		finally {
			release.countDown();
		}
		assertThat(seqs(ada, id, "")).isEmpty();
	}

	@Autowired
	org.springframework.transaction.PlatformTransactionManager transactions;

}
