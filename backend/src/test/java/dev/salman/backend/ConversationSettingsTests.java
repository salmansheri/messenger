package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;

class ConversationSettingsTests extends RealtimeIntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private String withGrace;

	@BeforeEach
	void adaAndGraceTalk() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		withGrace = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private String freshToken(Account who) throws Exception {
		return client.loginForTokens(who.email(), AuthClient.PASSWORD).accessToken();
	}

	private String newConversation(Account with) throws Exception {
		return idOf(client.startDirect(ada.accessToken(), with.id()));
	}

	// ---- defaults and privacy

	@Test
	void everyConversationStartsUnmutedUnarchivedAndUnpinned() throws Exception {
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].settings.muted").value(false))
				.andExpect(jsonPath("$[0].settings.mutedUntil").doesNotExist())
				.andExpect(jsonPath("$[0].settings.archived").value(false))
				.andExpect(jsonPath("$[0].settings.pinned").value(false));
	}

	@Test
	void settingsBelongToTheirOwnerOnlyAndAnOutsiderIsNotFound() throws Exception {
		var outsider = client.account("Linus Torvalds");

		client.updateSettings(ada.accessToken(), withGrace, Map.of("pinned", true, "mute", "ALWAYS"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.settings.pinned").value(true))
				.andExpect(jsonPath("$.settings.muted").value(true));

		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].settings.pinned").value(false))
				.andExpect(jsonPath("$[0].settings.muted").value(false));
		client.updateSettings(outsider.accessToken(), withGrace, Map.of("pinned", true))
				.andExpect(status().isNotFound());
	}

	// ---- mute

	@Test
	void aMuteLastsEightHoursOrAWeekOrForeverAndExpiresOnItsOwn() throws Exception {
		var before = Instant.now();
		client.updateSettings(ada.accessToken(), withGrace, Map.of("mute", "EIGHT_HOURS"))
				.andExpect(jsonPath("$.settings.muted").value(true))
				.andExpect(jsonPath("$.settings.mutedUntil").isNotEmpty());
		var until = Instant.parse(json.readTree(client.conversation(ada.accessToken(), withGrace).andReturn().getResponse()
				.getContentAsString()).get("settings").get("mutedUntil").asString());
		assertThat(Duration.between(before, until)).isBetween(Duration.ofHours(8).minusSeconds(5),
				Duration.ofHours(8).plusMinutes(1));

		clock.advance(Duration.ofHours(9));
		client.conversations(freshToken(ada))
				.andExpect(jsonPath("$[0].settings.muted").value(false))
				.andExpect(jsonPath("$[0].settings.mutedUntil").doesNotExist());
	}

	@Test
	void aWeekLongMuteIsStillActiveAfterSixDaysAndOverAfterEight() throws Exception {
		client.updateSettings(ada.accessToken(), withGrace, Map.of("mute", "ONE_WEEK")).andExpect(status().isOk());

		clock.advance(Duration.ofDays(6));
		client.conversations(freshToken(ada)).andExpect(jsonPath("$[0].settings.muted").value(true));
		clock.advance(Duration.ofDays(2));
		client.conversations(freshToken(ada)).andExpect(jsonPath("$[0].settings.muted").value(false));
	}

	@Test
	void anIndefiniteMuteHasNoEndAndUnmutingClearsAnyMute() throws Exception {
		client.updateSettings(ada.accessToken(), withGrace, Map.of("mute", "ALWAYS"))
				.andExpect(jsonPath("$.settings.muted").value(true))
				.andExpect(jsonPath("$.settings.mutedUntil").doesNotExist());
		clock.advance(Duration.ofDays(400));
		client.conversations(freshToken(ada)).andExpect(jsonPath("$[0].settings.muted").value(true));

		client.updateSettings(freshToken(ada), withGrace, Map.of("mute", "NONE"))
				.andExpect(jsonPath("$.settings.muted").value(false));
	}

	@Test
	void anUnknownMuteValueOrAnEmptyChangeIsABadRequest() throws Exception {
		client.updateSettings(ada.accessToken(), withGrace, Map.of("mute", "FOR_A_BIT")).andExpect(status().isBadRequest());
		client.updateSettings(ada.accessToken(), withGrace, Map.of()).andExpect(status().isBadRequest());
	}

	@Test
	void aMutedConversationStillCountsUnreadAndStillGetsLiveEventsButNoPush() throws Exception {
		client.registerDevice(grace.accessToken(), "grace-phone", "ANDROID").andExpect(status().isCreated());
		client.updateSettings(grace.accessToken(), withGrace, Map.of("mute", "ALWAYS")).andExpect(status().isOk());
		var forGrace = listening(grace);

		client.sendNew(ada.accessToken(), withGrace, "While muted");

		assertThat(forGrace.await(e -> isType(e, "message.created", withGrace))).isNotNull();
		Thread.sleep(1500);
		assertThat(pushes.all()).isEmpty();
		client.conversations(grace.accessToken()).andExpect(jsonPath("$[0].unreadCount").value(1));
	}

	@Test
	void anUnmutedRecipientStillGetsPushAndAMuteEndsOnItsOwn() throws Exception {
		client.registerDevice(grace.accessToken(), "grace-phone", "ANDROID").andExpect(status().isCreated());
		client.updateSettings(grace.accessToken(), withGrace, Map.of("mute", "EIGHT_HOURS"))
				.andExpect(status().isOk());
		client.sendNew(ada.accessToken(), withGrace, "Quiet");
		Thread.sleep(1500);
		assertThat(pushes.all()).isEmpty();

		clock.advance(Duration.ofHours(9));
		client.sendNew(freshToken(ada), withGrace, "Audible");

		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 1);
		assertThat(pushes.all().getFirst().body()).isEqualTo("Audible");
	}

	@Test
	void mutingAffectsOnlyTheOneWhoMutedSoTheOtherParticipantIsStillPushed() throws Exception {
		client.registerDevice(ada.accessToken(), "ada-phone", "ANDROID").andExpect(status().isCreated());
		client.registerDevice(grace.accessToken(), "grace-phone", "ANDROID").andExpect(status().isCreated());
		client.updateSettings(ada.accessToken(), withGrace, Map.of("mute", "ALWAYS")).andExpect(status().isOk());

		client.sendNew(grace.accessToken(), withGrace, "To Ada, who muted it");
		Thread.sleep(1500);
		assertThat(pushes.all()).isEmpty();

		client.sendNew(ada.accessToken(), withGrace, "To Grace, who did not");
		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 1);
		assertThat(pushes.all().getFirst().deviceToken()).isEqualTo("grace-phone");
	}

	// ---- archive

	@Test
	void archivingStaysUntilTheOwnerUndoesItEvenWhenNewMessagesArrive() throws Exception {
		client.updateSettings(ada.accessToken(), withGrace, Map.of("archived", true))
				.andExpect(jsonPath("$.settings.archived").value(true));

		client.sendNew(grace.accessToken(), withGrace, "Still archived?");
		client.sendNew(ada.accessToken(), withGrace, "Even my own message");

		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].settings.archived").value(true))
				.andExpect(jsonPath("$[0].lastMessage.body").value("Even my own message"));
		client.conversations(grace.accessToken()).andExpect(jsonPath("$[0].settings.archived").value(false));

		client.updateSettings(ada.accessToken(), withGrace, Map.of("archived", false))
				.andExpect(jsonPath("$.settings.archived").value(false));
	}

	// ---- pin

	@Test
	void aUserMayPinThreeConversationsAndTheFourthIsRefusedUntilOneIsUnpinned() throws Exception {
		var one = newConversation(client.account("One"));
		var two = newConversation(client.account("Two"));
		var three = newConversation(client.account("Three"));
		var four = newConversation(client.account("Four"));
		for (var id : new String[] { one, two, three }) {
			client.updateSettings(ada.accessToken(), id, Map.of("pinned", true)).andExpect(status().isOk());
		}

		client.updateSettings(ada.accessToken(), four, Map.of("pinned", true))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("You can pin at most 3 Conversations."));
		client.updateSettings(ada.accessToken(), one, Map.of("pinned", true)).andExpect(status().isOk()); // already pinned
		client.updateSettings(ada.accessToken(), one, Map.of("pinned", false)).andExpect(status().isOk());
		client.updateSettings(ada.accessToken(), four, Map.of("pinned", true)).andExpect(status().isOk());
	}

	@Test
	void sixConcurrentPinsByOneUserLeaveExactlyThreePinned() throws Exception {
		var ids = new java.util.ArrayList<String>();
		for (int i = 0; i < 6; i++) {
			ids.add(newConversation(client.account("Friend " + i)));
		}
		var pool = java.util.concurrent.Executors.newFixedThreadPool(6);
		try {
			var start = new java.util.concurrent.CountDownLatch(1);
			var results = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
			for (var id : ids) {
				results.add(pool.submit(() -> {
					start.await();
					return client.updateSettings(ada.accessToken(), id, Map.of("pinned", true)).andReturn()
							.getResponse().getStatus();
				}));
			}
			start.countDown();
			var statuses = new java.util.ArrayList<Integer>();
			for (var result : results) {
				statuses.add(result.get());
			}
			assertThat(statuses).filteredOn(code -> code == 200).hasSize(3);
			assertThat(statuses).filteredOn(code -> code == 409).hasSize(3);
		}
		finally {
			pool.shutdownNow();
		}
		var pinned = json.readTree(client.conversations(ada.accessToken()).andReturn().getResponse()
				.getContentAsString());
		var count = 0;
		for (var conversation : pinned) {
			count += conversation.get("settings").get("pinned").asBoolean() ? 1 : 0;
		}
		assertThat(count).isEqualTo(3);
	}

	@Test
	void archivingAndPinningTheSameConversationAtTheSameTimeNeverEndsBothOrFailsWithAServerError() throws Exception {
		for (int round = 0; round < 8; round++) {
			var conversation = newConversation(client.account("Round " + round));
			var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
			try {
				var start = new java.util.concurrent.CountDownLatch(1);
				var archive = pool.submit(() -> {
					start.await();
					return client.updateSettings(ada.accessToken(), conversation, Map.of("archived", true))
							.andReturn().getResponse().getStatus();
				});
				var pin = pool.submit(() -> {
					start.await();
					return client.updateSettings(ada.accessToken(), conversation, Map.of("pinned", true)).andReturn()
							.getResponse().getStatus();
				});
				start.countDown();
				assertThat(archive.get()).isEqualTo(200);
				assertThat(pin.get()).isIn(200, 409);
			}
			finally {
				pool.shutdownNow();
			}
			client.conversation(ada.accessToken(), conversation)
					.andExpect(jsonPath("$.settings.archived").value(true))
					.andExpect(jsonPath("$.settings.pinned").value(false));
		}
	}

	@Test
	void theLimitIsPerUserSoAnotherUserMayStillPin() throws Exception {
		for (int i = 0; i < 3; i++) {
			client.updateSettings(ada.accessToken(), newConversation(client.account("Friend " + i)),
					Map.of("pinned", true)).andExpect(status().isOk());
		}

		client.updateSettings(grace.accessToken(), withGrace, Map.of("pinned", true)).andExpect(status().isOk());
	}

	@Test
	void pinnedConversationsComeFirstThenTheRestByRecentActivity() throws Exception {
		var older = newConversation(client.account("Older"));
		var newer = newConversation(client.account("Newer"));
		client.sendNew(ada.accessToken(), older, "first");
		client.sendNew(ada.accessToken(), newer, "second");
		client.sendNew(ada.accessToken(), withGrace, "third, so most recent");
		client.conversations(ada.accessToken()).andExpect(jsonPath("$[0].id").value(withGrace));

		client.updateSettings(ada.accessToken(), older, Map.of("pinned", true)).andExpect(status().isOk());

		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].id").value(older))
				.andExpect(jsonPath("$[1].id").value(withGrace))
				.andExpect(jsonPath("$[2].id").value(newer));
		client.sendNew(ada.accessToken(), newer, "newest of all");
		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].id").value(older))
				.andExpect(jsonPath("$[1].id").value(newer));
	}

	@Test
	void anArchivedConversationCannotBePinnedAndArchivingAPinnedOneUnpinsIt() throws Exception {
		client.updateSettings(ada.accessToken(), withGrace, Map.of("pinned", true)).andExpect(status().isOk());

		client.updateSettings(ada.accessToken(), withGrace, Map.of("archived", true))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.settings.archived").value(true))
				.andExpect(jsonPath("$.settings.pinned").value(false));
		client.updateSettings(ada.accessToken(), withGrace, Map.of("pinned", true))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("Unarchive it before pinning."));
		client.updateSettings(ada.accessToken(), withGrace, Map.of("archived", false, "pinned", true))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.settings.archived").value(false))
				.andExpect(jsonPath("$.settings.pinned").value(true));
	}

	@Test
	void askingToArchiveAndPinInOneRequestIsABadRequest() throws Exception {
		client.updateSettings(ada.accessToken(), withGrace, Map.of("archived", true, "pinned", true))
				.andExpect(status().isBadRequest());
	}

	// ---- leaving and removal

	@Test
	void leavingOrBeingRemovedClearsTheSettingsSoComingBackStartsFresh() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Duo", grace.id()));
		client.updateSettings(grace.accessToken(), group, Map.of("pinned", true, "mute", "ALWAYS"))
				.andExpect(status().isOk());

		client.removeParticipant(ada.accessToken(), group, grace.id()).andExpect(status().isNoContent());
		client.addParticipant(ada.accessToken(), group, grace.id()).andExpect(status().is2xxSuccessful());

		client.conversations(grace.accessToken()).andExpect(jsonPath("$[?(@.id=='" + group + "')].settings.pinned")
				.value(false));
		client.conversation(grace.accessToken(), group)
				.andExpect(jsonPath("$.settings.pinned").value(false))
				.andExpect(jsonPath("$.settings.muted").value(false));

		client.updateSettings(grace.accessToken(), group, Map.of("archived", true)).andExpect(status().isOk());
		client.leave(grace.accessToken(), group).andExpect(status().isNoContent());
		client.addParticipant(ada.accessToken(), group, grace.id()).andExpect(status().is2xxSuccessful());
		client.conversation(grace.accessToken(), group).andExpect(jsonPath("$.settings.archived").value(false));
	}

	// ---- realtime

	@Test
	void settingsChangedReachesEveryOpenSessionOfTheOwnerAndNobodyElse() throws Exception {
		var phone = listening(ada);
		var laptop = listening(ada);
		var forGrace = listening(grace);

		client.updateSettings(ada.accessToken(), withGrace, Map.of("pinned", true, "mute", "ALWAYS"))
				.andExpect(status().isOk());

		for (var socket : new dev.salman.backend.support.StompTestClient[] { phone, laptop }) {
			var seen = socket.await(e -> isType(e, "settings.changed", withGrace));
			assertThat(seen.get("settings").get("pinned").asBoolean()).isTrue();
			assertThat(seen.get("settings").get("muted").asBoolean()).isTrue();
			assertThat(seen.get("settings").get("archived").asBoolean()).isFalse();
		}
		assertThat(forGrace.receivesNothingMatching(e -> "settings.changed".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void aChangeThatChangesNothingSendsNoEvent() throws Exception {
		var forAda = listening(ada);

		client.updateSettings(ada.accessToken(), withGrace, Map.of("pinned", false, "archived", false))
				.andExpect(status().isOk());

		assertThat(forAda.receivesNothingMatching(e -> "settings.changed".equals(e.path("type").asString()), 800))
				.isTrue();
	}

}
