package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import dev.salman.backend.config.PushAmqpConfig;
import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import dev.salman.backend.support.RecordingNotificationSender.Push;

class PushTests extends RealtimeIntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	AmqpAdmin amqpAdmin;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private String conversation;

	@BeforeEach
	void adaAndGraceTalk() throws Exception {
		amqpAdmin.purgeQueue(PushAmqpConfig.DEAD, true);
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		conversation = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private String register(Account who, String token) throws Exception {
		return idOf(client.registerDevice(who.accessToken(), token, "ANDROID").andExpect(status().isCreated()));
	}

	private boolean pushedTo(String token) {
		return pushes.all().stream().anyMatch(p -> p.deviceToken().equals(token));
	}

	private Push pushTo(String token) {
		await().atMost(Duration.ofSeconds(10)).until(() -> pushedTo(token));
		return pushes.all().stream().filter(p -> p.deviceToken().equals(token)).findFirst().orElseThrow();
	}

	private int devicesWithToken(String token) {
		return jdbc.queryForObject("select count(*) from device where token = ?", Integer.class, token);
	}

	// ---- registering devices

	@Test
	void aUserRegistersADeviceAndTheTokenIsNeverEchoedBack() throws Exception {
		var response = client.registerDevice(ada.accessToken(), "fcm-token-1", "ANDROID")
				.andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.platform").value("ANDROID")).andReturn().getResponse().getContentAsString();

		assertThat(response).doesNotContain("fcm-token-1");
	}

	@Test
	void registeringTheSameTokenAgainChangesNothing() throws Exception {
		var first = register(ada, "fcm-token-1");

		client.registerDevice(ada.accessToken(), "fcm-token-1", "ANDROID").andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(first));

		assertThat(devicesWithToken("fcm-token-1")).isEqualTo(1);
	}

	@Test
	void badRegistrationsAreRefused() throws Exception {
		client.registerDevice(ada.accessToken(), "", "ANDROID").andExpect(status().isBadRequest());
		client.registerDevice(ada.accessToken(), "   ", "ANDROID").andExpect(status().isBadRequest());
		client.registerDevice(ada.accessToken(), "a\u0000b", "ANDROID").andExpect(status().isBadRequest());
		client.registerDevice(ada.accessToken(), "x".repeat(4097), "ANDROID").andExpect(status().isBadRequest());
		client.registerDevice(ada.accessToken(), "fcm-token-1", null).andExpect(status().isBadRequest());
		client.registerDevice(ada.accessToken(), "fcm-token-1", "FAX").andExpect(status().isBadRequest());
		client.registerDevice("not-a-jwt", "fcm-token-1", "ANDROID").andExpect(status().isUnauthorized());
	}

	@Test
	void aUserCannotRegisterMoreThanTheMaximumNumberOfDevices() throws Exception {
		for (int i = 0; i < 10; i++) {
			register(ada, "fcm-many-" + i);
		}

		client.registerDevice(ada.accessToken(), "fcm-many-10", "ANDROID").andExpect(status().isConflict());
		client.registerDevice(ada.accessToken(), "fcm-many-3", "ANDROID").andExpect(status().isOk());
	}

	@Test
	void aPhoneSignedInUnderAnotherAccountMovesToThatAccount() throws Exception {
		register(grace, "shared-phone");
		register(linus, "shared-phone");
		var withLinus = idOf(client.startDirect(ada.accessToken(), linus.id()));

		client.sendNew(ada.accessToken(), conversation, "to grace: the phone is no longer hers");
		client.sendNew(ada.accessToken(), withLinus, "to linus");

		assertThat(pushTo("shared-phone").body()).isEqualTo("to linus");
		assertThat(devicesWithToken("shared-phone")).isEqualTo(1);
		assertThat(pushes.all()).hasSize(1);
	}

	// ---- unregistering

	@Test
	void anUnregisteredDeviceGetsNoMorePushes() throws Exception {
		var gone = register(grace, "grace-gone");
		register(grace, "grace-kept");
		client.unregisterDevice(grace.accessToken(), gone).andExpect(status().isNoContent());
		client.unregisterDevice(grace.accessToken(), gone).andExpect(status().isNoContent());

		client.sendNew(ada.accessToken(), conversation, "hello");

		pushTo("grace-kept");
		assertThat(pushedTo("grace-gone")).isFalse();
	}

	@Test
	void youCannotUnregisterSomeoneElsesDevice() throws Exception {
		var graces = register(grace, "grace-phone");

		client.unregisterDevice(ada.accessToken(), graces).andExpect(status().isNoContent());
		client.sendNew(ada.accessToken(), conversation, "hello");

		pushTo("grace-phone");
	}

	// ---- who is pushed

	@Test
	void anOfflineRecipientGetsAPushWithTheSendersNameAndThePreview() throws Exception {
		register(grace, "grace-phone");
		register(grace, "grace-laptop");

		client.sendNew(ada.accessToken(), conversation, "Are you coming tonight?");

		var phone = pushTo("grace-phone");
		assertThat(phone.title()).isEqualTo("Ada Lovelace");
		assertThat(phone.body()).isEqualTo("Are you coming tonight?");
		assertThat(pushTo("grace-laptop").body()).isEqualTo("Are you coming tonight?");
	}

	@Test
	void anOnlineRecipientGetsNoPushAndNeitherDoesTheSender() throws Exception {
		register(ada, "ada-phone");
		register(grace, "grace-phone");
		register(linus, "linus-phone");
		var linusChat = idOf(client.startDirect(ada.accessToken(), linus.id()));
		listening(grace);

		client.sendNew(ada.accessToken(), conversation, "to grace, who is online");
		client.sendNew(ada.accessToken(), linusChat, "to linus, who is not");

		pushTo("linus-phone"); // the control: the worker has certainly handled the first message by now
		assertThat(pushedTo("grace-phone")).as("grace is online").isFalse();
		assertThat(pushedTo("ada-phone")).as("the sender").isFalse();
	}

	@Test
	void aGroupPushNamesTheGroupAndSkipsPeopleWhoLeft() throws Exception {
		register(grace, "grace-phone");
		register(linus, "linus-phone");
		var group = idOf(client.createGroup(ada.accessToken(), "Analytical Engine", grace.id(), linus.id()));
		client.leave(linus.accessToken(), group).andExpect(status().isNoContent());

		client.sendNew(ada.accessToken(), group, "meeting at nine");

		assertThat(pushTo("grace-phone").title()).isEqualTo("Ada Lovelace in Analytical Engine");
		assertThat(pushedTo("linus-phone")).isFalse();
	}

	@Test
	void aLongMessageIsCutToAPreview() throws Exception {
		register(grace, "grace-phone");

		client.sendNew(ada.accessToken(), conversation, "a".repeat(250));

		assertThat(pushTo("grace-phone").body()).isEqualTo("a".repeat(100) + "…");
	}

	@Test
	void aRetriedSendDoesNotPushTwice() throws Exception {
		register(grace, "grace-phone");
		var id = UUID.randomUUID();

		client.send(ada.accessToken(), conversation, id, "once").andExpect(status().isCreated());
		client.send(ada.accessToken(), conversation, id, "once").andExpect(status().isOk());

		pushTo("grace-phone");
		Thread.sleep(1_500);
		assertThat(pushes.all()).hasSize(1);
	}

	// ---- failures

	@Test
	void sendingSucceedsEvenWhenThePushProviderIsDown() throws Exception {
		register(grace, "grace-phone");
		pushes.failNext(1_000);

		client.send(ada.accessToken(), conversation, UUID.randomUUID(), "still arrives").andExpect(status().isCreated());

		client.history(grace.accessToken(), conversation, "").andExpect(jsonPath("$.messages[0].body")
				.value("still arrives"));
		// Wait until the delivery has used its attempts: one still retrying would succeed in the next test, once its
		// reset has cleared the failures, and show up there as an unexpected push.
		assertThat(buried().getMessageProperties().<String>getHeader("kind")).isEqualTo("delivery");
	}

	@Test
	void aTemporaryFailureIsRetriedUntilItWorks() throws Exception {
		register(grace, "grace-phone");
		pushes.failNext(2);

		client.sendNew(ada.accessToken(), conversation, "eventually");

		assertThat(pushTo("grace-phone").body()).isEqualTo("eventually");
		assertThat(pushes.attempts()).isEqualTo(3);
	}

	@Test
	void aProviderThatStaysDownIsGivenUpOnAfterTheMaximumNumberOfAttempts() throws Exception {
		register(grace, "grace-phone");
		pushes.failNext(1_000);

		client.sendNew(ada.accessToken(), conversation, "never");

		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.attempts() >= 3);
		Thread.sleep(1_500);
		assertThat(pushes.attempts()).as("max attempts, no more").isEqualTo(3);
		assertThat(devicesWithToken("grace-phone")).as("a failure is not a rejection").isEqualTo(1);
	}

	@Test
	void aTokenTheProviderRejectsIsRemovedAndNotTriedAgain() throws Exception {
		register(grace, "grace-dead");
		register(grace, "grace-live");
		pushes.reject("grace-dead");

		client.sendNew(ada.accessToken(), conversation, "one");

		pushTo("grace-live");
		await().atMost(Duration.ofSeconds(10)).until(() -> devicesWithToken("grace-dead") == 0);
		var before = pushes.attempts();
		client.sendNew(ada.accessToken(), conversation, "two");
		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() == 2);
		assertThat(pushes.attempts() - before).as("only the live device was tried").isEqualTo(1);
		assertThat(devicesWithToken("grace-live")).isEqualTo(1);
	}

	// ---- lost work, retries and dead letters

	private org.springframework.amqp.core.Message buried() {
		var holder = new org.springframework.amqp.core.Message[1];
		await().atMost(Duration.ofSeconds(10)).until(() -> {
			holder[0] = rabbit.receive(PushAmqpConfig.DEAD, 200);
			return holder[0] != null;
		});
		return holder[0];
	}

	@Test
	void aFailureWhileQueueingRetriesTheJobWithoutPushingAnyDeviceTwice() throws Exception {
		register(grace, "grace-phone");
		register(grace, "grace-laptop");
		pushQueue.failDeliverCalls(2); // the first device is queued, then the broker hiccups

		client.sendNew(ada.accessToken(), conversation, "both devices, once each");

		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.all().size() >= 2);
		Thread.sleep(1_500);
		assertThat(pushes.all()).extracting(Push::deviceToken).containsExactlyInAnyOrder("grace-phone", "grace-laptop");
	}

	@Test
	void aJobThatKeepsFailingEndsOnTheDeadLetterQueue() throws Exception {
		register(grace, "grace-phone");
		pushQueue.failAllDeliveries();

		client.sendNew(ada.accessToken(), conversation, "never queued");

		var dead = buried();
		assertThat(dead.getMessageProperties().<String>getHeader("kind")).isEqualTo("job");
		assertThat(pushes.all()).isEmpty();
	}

	@Test
	void aDeliveryThatRunsOutOfAttemptsEndsOnTheDeadLetterQueue() throws Exception {
		register(grace, "grace-phone");
		pushes.failNext(1_000);

		client.sendNew(ada.accessToken(), conversation, "provider is down");

		assertThat(buried().getMessageProperties().<String>getHeader("kind")).isEqualTo("delivery");
		assertThat(pushes.attempts()).isEqualTo(3);
	}

	@Test
	void aDeliveryThatCannotBeQueuedForRetryIsBuriedNotLost() throws Exception {
		register(grace, "grace-phone");
		pushes.failNext(1_000);
		pushQueue.failRetries();

		client.sendNew(ada.accessToken(), conversation, "provider and broker both struggling");

		assertThat(buried().getMessageProperties().<String>getHeader("kind")).isEqualTo("delivery");
		assertThat(pushes.attempts()).isEqualTo(1);
	}

	@Test
	void anUnexpectedErrorIsNotRetried() throws Exception {
		register(grace, "grace-phone");
		pushes.breakNext(new IllegalStateException("a bug"));

		client.sendNew(ada.accessToken(), conversation, "one try only");

		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.attempts() >= 1);
		Thread.sleep(1_500);
		assertThat(pushes.attempts()).isEqualTo(1);
		assertThat(pushes.all()).isEmpty();
		assertThat(devicesWithToken("grace-phone")).isEqualTo(1);
	}

	@Autowired
	RabbitTemplate rabbit;

	@Test
	void aRejectionOnlyRemovesTheRegistrationThatWasQueued() throws Exception {
		register(linus, "moved-phone");
		pushes.reject("moved-phone");

		// queued while the phone belonged to Grace, delivered after it moved to Linus
		var stale = new PushDelivery(UUID.randomUUID(), UUID.fromString(grace.id()), "moved-phone", "t", "b", 1);
		rabbit.convertAndSend(PushAmqpConfig.DELIVERIES, json.writeValueAsString(stale));
		await().atMost(Duration.ofSeconds(10)).until(() -> pushes.attempts() >= 1);
		Thread.sleep(500);
		assertThat(devicesWithToken("moved-phone")).as("linus keeps his registration").isEqualTo(1);

		var current = new PushDelivery(UUID.randomUUID(), UUID.fromString(linus.id()), "moved-phone", "t", "b", 1);
		rabbit.convertAndSend(PushAmqpConfig.DELIVERIES, json.writeValueAsString(current));
		await().atMost(Duration.ofSeconds(10)).until(() -> devicesWithToken("moved-phone") == 0);
	}

	// ---- when a User goes away

	@Test
	void resettingThePasswordDropsEveryDeviceOfThatUser() throws Exception {
		register(grace, "grace-phone");
		register(grace, "grace-laptop");
		register(ada, "ada-phone");
		var email = grace.email();

		client.forgotPassword(email).andExpect(status().isNoContent());
		client.resetPassword(email, client.latestCode(email), "a-brand-new-password").andExpect(status().isNoContent());

		assertThat(devicesWithToken("grace-phone") + devicesWithToken("grace-laptop")).isZero();
		assertThat(devicesWithToken("ada-phone")).isEqualTo(1);
	}

	@Test
	void loggingOutWithADeviceIdStopsPushesToThatDeviceOnly() throws Exception {
		var phone = register(grace, "grace-phone");
		register(grace, "grace-laptop");
		var refresh = AuthClient.refreshCookieValue(client.login(grace.email(), AuthClient.PASSWORD)
				.andExpect(status().isOk()));

		client.logoutDevice(refresh, phone).andExpect(status().isNoContent());

		assertThat(devicesWithToken("grace-phone")).isZero();
		assertThat(devicesWithToken("grace-laptop")).isEqualTo(1);
	}

	@Test
	void loggingOutCannotRemoveSomeoneElsesDevice() throws Exception {
		var adas = register(ada, "ada-phone");
		var refresh = AuthClient.refreshCookieValue(client.login(grace.email(), AuthClient.PASSWORD)
				.andExpect(status().isOk()));

		client.logoutDevice(refresh, adas).andExpect(status().isNoContent());

		assertThat(devicesWithToken("ada-phone")).isEqualTo(1);
	}

	@Test
	void aDeviceIdWithoutAValidSessionRemovesNothing() throws Exception {
		var phone = register(grace, "grace-phone");

		client.logoutDevice("not-a-real-refresh-token", phone).andExpect(status().isNoContent());

		assertThat(devicesWithToken("grace-phone")).isEqualTo(1);
	}

}
