package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import dev.salman.backend.support.RawStompSocket;
import dev.salman.backend.support.StompTestClient;
import tools.jackson.databind.JsonNode;

class RealtimeTests extends RealtimeIntegrationTest {

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;

	@BeforeEach
	void accounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
	}

	// ---- connecting

	@Test
	void aConnectionWithoutAValidAccessTokenIsRefused() throws Exception {
		var none = StompTestClient.connect(port, null, json);
		var garbage = StompTestClient.connect(port, "not-a-jwt", json);
		open.add(none);
		open.add(garbage);

		assertThat(none.awaitConnected()).isFalse();
		assertThat(garbage.awaitConnected()).isFalse();
		assertThat(none.awaitRefused()).isTrue();
		assertThat(garbage.awaitRefused()).isTrue();
	}

	@Test
	void anExpiredAccessTokenIsRefused() throws Exception {
		clock.advance(Duration.ofMinutes(16));

		var expired = StompTestClient.connect(port, ada.accessToken(), json);
		open.add(expired);

		assertThat(expired.awaitConnected()).isFalse();
	}

	@Test
	void aValidAccessTokenConnectsAndMayListenOnItsOwnQueues() throws Exception {
		var socket = listening(ada);

		assertThat(socket.refusal()).isNull();
	}

	@Test
	void subscribingToAnythingElseIsRefused() throws Exception {
		for (var destination : new String[] { "/topic/anything", "/queue/events", "/user/queue/other",
				"/user/" + grace.id() + "/queue/events", "/queue/events-user" + grace.id() }) {
			var socket = StompTestClient.connect(port, ada.accessToken(), json);
			open.add(socket);
			assertThat(socket.awaitConnected()).isTrue();

			try {
				socket.subscribe(destination);
			}
			catch (AssertionError expected) {
				// the subscription was never acknowledged, which is the point
			}

			assertThat(socket.awaitRefused()).as(destination).isTrue();
		}
	}

	@Test
	void sendingToAnythingButTheReceiptsDestinationIsRefused() throws Exception {
		var socket = listening(ada);

		socket.send("/app/conversations/" + UUID.randomUUID() + "/messages", Map.of("body", "x"));

		assertThat(socket.awaitRefused()).isTrue();
	}

	@Test
	void aSocketStopsWorkingWhenItsAccessTokenExpires() throws Exception {
		var socket = listening(ada);
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));

		clock.advance(Duration.ofMinutes(16));
		socket.send("/app/conversations/" + conversation + "/receipts", Map.of("readSeq", 0));

		assertThat(socket.awaitRefused()).isTrue();
	}

	@Test
	void theSweeperClosesSocketsWhoseAccessTokenHasExpiredEvenIfTheyAreIdle() throws Exception {
		var idle = listening(ada);
		clock.advance(Duration.ofMinutes(16));

		sessions.closeExpired();

		assertThat(idle.awaitRefused()).as("closed: " + idle.refusal()).isTrue();
	}

	// ---- live messages

	@Test
	void everyParticipantReceivesANewMessageLiveAndOutsidersDoNot() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var forAda = listening(ada);
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		client.sendNew(ada.accessToken(), conversation, "hello live");

		var seenByGrace = forGrace.await(e -> isType(e, "message.created", conversation));
		assertThat(seenByGrace.get("message").get("body").asString()).isEqualTo("hello live");
		assertThat(seenByGrace.get("message").get("seq").asInt()).isEqualTo(1);
		assertThat(seenByGrace.get("message").get("senderId").asString()).isEqualTo(ada.id());
		assertThat(seenByGrace.toString()).doesNotContain("@example.com");
		assertThat(forAda.await(e -> isType(e, "message.created", conversation))).isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> "message.created".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void everyOpenSessionOfAUserReceivesTheEvent() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var phone = listening(grace);
		var laptop = listening(grace);

		client.sendNew(ada.accessToken(), conversation, "to both devices");

		assertThat(phone.await(e -> isType(e, "message.created", conversation))).isNotNull();
		assertThat(laptop.await(e -> isType(e, "message.created", conversation))).isNotNull();
	}

	@Test
	void aRetriedSendDoesNotPushTheMessageAgain() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var forGrace = listening(grace);
		var clientMessageId = UUID.randomUUID().toString();

		client.send(ada.accessToken(), conversation, clientMessageId, "once").andExpect(status().isCreated());
		forGrace.await(e -> isType(e, "message.created", conversation));
		client.send(ada.accessToken(), conversation, clientMessageId, "once").andExpect(status().isOk());

		assertThat(forGrace.receivesNothingMatching(e -> isType(e, "message.created", conversation), 800)).isTrue();
	}

	// ---- membership

	@Test
	void aRemovedParticipantStopsReceivingEventsAtOnce() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		client.removeParticipant(ada.accessToken(), group, grace.id()).andExpect(status().isNoContent());
		assertThat(forGrace.await(e -> isType(e, "conversation.changed", group))).as("told it changed").isNotNull();
		client.sendNew(ada.accessToken(), group, "after the removal");

		assertThat(forLinus.await(e -> isType(e, "message.created", group))).isNotNull();
		assertThat(forGrace.receivesNothingMatching(e -> "message.created".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void aParticipantWhoLeavesStopsReceivingEvents() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		var forLinus = listening(linus);

		client.leave(linus.accessToken(), group).andExpect(status().isNoContent());
		forLinus.await(e -> isType(e, "conversation.changed", group));
		client.sendNew(ada.accessToken(), group, "after linus left");

		assertThat(forLinus.receivesNothingMatching(e -> "message.created".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void creatingAddingRenamingAndStartingConversationsTellsThoseConcerned() throws Exception {
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		var direct = idOf(client.startDirect(ada.accessToken(), grace.id()));
		assertThat(forGrace.await(e -> isType(e, "conversation.changed", direct))).isNotNull();

		var group = idOf(client.createGroup(ada.accessToken(), "Pair", grace.id()));
		assertThat(forGrace.await(e -> isType(e, "conversation.changed", group))).isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> isType(e, "conversation.changed", group), 500)).isTrue();

		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isOk());
		assertThat(forLinus.await(e -> isType(e, "conversation.changed", group))).as("the added user").isNotNull();

		client.rename(ada.accessToken(), group, "Renamed").andExpect(status().isOk());
		assertThat(forGrace.await(e -> isType(e, "conversation.changed", group))).isNotNull();
		assertThat(forLinus.await(e -> isType(e, "conversation.changed", group))).isNotNull();
	}

	// ---- receipts

	@Test
	void receiptReportsReachTheSenderAsAFrontierAndTheReporterAsTheirOwnPositions() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		for (int i = 1; i <= 3; i++) {
			client.sendNew(ada.accessToken(), conversation, "message " + i);
		}
		var forAda = listening(ada);
		var forGrace = listening(grace);

		client.receipts(grace.accessToken(), conversation, 3, 2).andExpect(status().isOk());

		var frontier = forAda.await(e -> isType(e, "receipts.updated", conversation));
		assertThat(frontier.get("deliveredUpTo").asInt()).isEqualTo(3);
		assertThat(frontier.get("readUpTo").asInt()).isEqualTo(2);
		var own = forGrace.await(e -> isType(e, "unread.updated", conversation));
		assertThat(own.get("deliveredSeq").asInt()).isEqualTo(3);
		assertThat(own.get("readSeq").asInt()).isEqualTo(2);
		assertThat(own.get("unreadCount").asInt()).isEqualTo(1);
		assertThat(forAda.receivesNothingMatching(e -> "unread.updated".equals(e.path("type").asString()), 500))
				.as("others do not learn the reporter's own positions").isTrue();
	}

	@Test
	void inAGroupTheFrontierIsHeldBackByTheLaggingMemberAndOnlyMovesWhenTheLaggardDoes() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		client.sendNew(ada.accessToken(), group, "one");
		client.sendNew(ada.accessToken(), group, "two");
		var forAda = listening(ada);

		client.receipts(grace.accessToken(), group, 2, 2).andExpect(status().isOk());
		assertThat(forAda.receivesNothingMatching(e -> isType(e, "receipts.updated", group), 800))
				.as("linus has read nothing, so nothing changed for ada").isTrue();

		client.receipts(linus.accessToken(), group, 2, 1).andExpect(status().isOk());
		var moved = forAda.await(e -> isType(e, "receipts.updated", group));
		assertThat(moved.get("readUpTo").asInt()).isEqualTo(1);
		assertThat(moved.get("deliveredUpTo").asInt()).isEqualTo(2);
	}

	@Test
	void onlyThoseWhoseFrontierMovedHearAboutAReport() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Trio", grace.id(), linus.id()));
		client.sendNew(ada.accessToken(), group, "one");
		client.sendNew(ada.accessToken(), group, "two");
		var forAda = listening(ada);
		var forLinus = listening(linus);

		client.receipts(grace.accessToken(), group, 2, 2).andExpect(status().isOk());

		// Linus's frontier is made of Ada (2/2 from sending) and Grace, who just caught up: it moved.
		assertThat(forLinus.await(e -> isType(e, "receipts.updated", group)).get("readUpTo").asInt()).isEqualTo(2);
		// Ada's is held back by Linus, who has not moved.
		assertThat(forAda.receivesNothingMatching(e -> isType(e, "receipts.updated", group), 500)).isTrue();
	}

	@Test
	void replyingTellsEveryoneWhoseMessagesItMarkedReadAndTheRepliersOtherDevices() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		client.sendNew(ada.accessToken(), conversation, "question");
		var forAda = listening(ada);
		var otherDeviceOfGrace = listening(grace);

		client.sendNew(grace.accessToken(), conversation, "answer");

		var frontier = forAda.await(e -> isType(e, "receipts.updated", conversation));
		assertThat(frontier.get("readUpTo").asInt()).as("ada's question now counts as read").isEqualTo(2);
		var own = otherDeviceOfGrace.await(e -> isType(e, "unread.updated", conversation));
		assertThat(own.get("unreadCount").asInt()).isZero();
	}

	@Test
	void aNoOpReceiptReportPushesNothing() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		client.sendNew(ada.accessToken(), conversation, "one");
		client.receipts(grace.accessToken(), conversation, 1, 1).andExpect(status().isOk());
		var forAda = listening(ada);

		client.receipts(grace.accessToken(), conversation, 1, 1).andExpect(status().isOk());
		client.receipts(grace.accessToken(), conversation, 0, 0).andExpect(status().isOk());

		assertThat(forAda.receivesNothingMatching(e -> "receipts.updated".equals(e.path("type").asString()), 800))
				.isTrue();
	}

	@Test
	void cursorUpdatesSentOverTheSocketUpdateReceiptsLikeTheRestEndpoint() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		client.sendNew(ada.accessToken(), conversation, "one");
		client.sendNew(ada.accessToken(), conversation, "two");
		var forAda = listening(ada);
		var forGrace = listening(grace);

		forGrace.send("/app/conversations/" + conversation + "/receipts", Map.of("deliveredSeq", 2, "readSeq", 2));

		var own = forGrace.await(e -> isType(e, "unread.updated", conversation));
		assertThat(own.get("unreadCount").asInt()).isZero();
		assertThat(forAda.await(e -> isType(e, "receipts.updated", conversation)).get("readUpTo").asInt())
				.isEqualTo(2);
		client.history(ada.accessToken(), conversation, "")
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
						.jsonPath("$.messages[1].status").value("READ"));
	}

	@Test
	void problemsWithASocketReceiptComeBackOnTheErrorQueue() throws Exception {
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		forGrace.send("/app/conversations/" + conversation + "/receipts", Map.of("readSeq", 99));
		forLinus.send("/app/conversations/" + conversation + "/receipts", Map.of("readSeq", 1));
		forGrace.send("/app/conversations/" + conversation + "/receipts", Map.of("readSeq", -5));
		forGrace.send("/app/conversations/" + conversation + "/receipts", Map.of());

		var beyond = forGrace.await(e -> "error".equals(e.path("type").asString()) && e.get("status").asInt() == 400);
		assertThat(beyond.get("detail").asString()).isNotBlank();
		assertThat(forLinus.await(e -> "error".equals(e.path("type").asString())).get("status").asInt())
				.as("a non-participant").isEqualTo(404);
	}

	// ---- across instances

	@Test
	void everyEventTravelsThroughRabbitMq() throws Exception {
		// Plays "another server instance": its own queue bound to the cluster's exchange.
		var queueName = "test-events-" + UUID.randomUUID();
		rabbit.execute(channel -> {
			channel.queueDeclare(queueName, true, false, false, null);
			channel.queueBind(queueName, realtimeExchange.getName(), "");
			return null;
		});
		try {
			var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
			client.sendNew(ada.accessToken(), conversation, "through the broker");

			JsonNode event = null;
			for (int i = 0; i < 50 && event == null; i++) {
				var body = rabbit.receive(queueName, 100);
				if (body != null && new String(body.getBody()).contains("through the broker")) {
					event = json.readTree(new String(body.getBody()));
				}
			}
			assertThat(event).as("an event for the message reached the exchange").isNotNull();
			var recipients = new ArrayList<String>();
			event.get("recipients").forEach(r -> recipients.add(r.asString()));
			assertThat(recipients).containsExactlyInAnyOrder(ada.id(), grace.id());
		}
		finally {
			rabbit.execute(channel -> channel.queueDelete(queueName));
		}
	}

	@Test
	void anEventPublishedByAnotherInstanceReachesTheUsersConnectedHere() throws Exception {
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		// What a second server instance would publish: the same exchange, the same JSON shape.
		var event = Map.of("recipients", List.of(grace.id()),
				"payload", Map.of("type", "conversation.changed", "conversationId", UUID.randomUUID().toString(),
						"origin", "another-instance"));
		rabbit.convertAndSend(realtimeExchange.getName(), "", json.writeValueAsString(event));

		assertThat(forGrace.await(e -> "another-instance".equals(e.path("origin").asString()))).isNotNull();
		assertThat(forLinus.receivesNothingMatching(e -> "another-instance".equals(e.path("origin").asString()), 800))
				.isTrue();
	}

	// ---- hardening

	@Test
	void aSecondConnectCannotSwapTheIdentityOfAnAuthenticatedSession() throws Exception {
		try (var socket = RawStompSocket.open(port)) {
			socket.connect(ada.accessToken());
			assertThat(socket.awaitFrame("CONNECTED")).as("first CONNECT accepted").isNotNull();

			socket.connect(grace.accessToken());

			assertThat(socket.awaitFrame("ERROR")).as("second CONNECT refused").isNotNull();
			assertThat(socket.awaitClosed()).isTrue();
		}
	}

	@Test
	void aSocketThatSendsOnlyHeartbeatsAndNeverAuthenticatesIsClosed() throws Exception {
		try (var socket = RawStompSocket.open(port)) {
			socket.send("\n");

			assertThat(socket.awaitClosed()).isTrue();
		}
	}

	@Test
	void aSweepLeavesAnAuthenticatedSocketWithAValidTokenAlone() throws Exception {
		try (var socket = RawStompSocket.open(port)) {
			socket.connect(ada.accessToken());
			assertThat(socket.awaitFrame("CONNECTED")).isNotNull();
			clock.advance(Duration.ofSeconds(30));

			sessions.closeExpired();

			assertThat(socket.isOpen()).isTrue();
		}
	}

	@Test
	void resettingAPasswordClosesEverySocketOfThatUserAndNobodyElses() throws Exception {
		var email = client.registerVerified();
		var token = client.loginForTokens(email, AuthClient.PASSWORD).accessToken();
		var phone = StompTestClient.connect(port, token, json);
		var laptop = StompTestClient.connect(port, token, json);
		open.add(phone);
		open.add(laptop);
		assertThat(phone.awaitConnected()).isTrue();
		assertThat(laptop.awaitConnected()).isTrue();
		var bystander = listening(grace);

		client.forgotPassword(email).andExpect(status().isNoContent());
		client.resetPassword(email, client.latestCode(email), "a-brand-new-password").andExpect(status().isNoContent());

		assertThat(phone.awaitRefused()).as("phone closed: " + phone.refusal()).isTrue();
		assertThat(laptop.awaitRefused()).isTrue();
		var conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
		client.sendNew(ada.accessToken(), conversation, "still working for others");
		assertThat(bystander.await(e -> isType(e, "message.created", conversation))).isNotNull();
	}

}
