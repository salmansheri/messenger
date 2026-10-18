package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.IntegrationTest;

class ReceiptTests extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private String direct;

	@BeforeEach
	void adaAndGraceTalk() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		direct = idOf(client.startDirect(ada.accessToken(), grace.id()));
	}

	private String idOf(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString()).get("id").asString();
	}

	private void sendFromAda(int count) throws Exception {
		for (int i = 1; i <= count; i++) {
			client.sendNew(ada.accessToken(), direct, "message " + i);
		}
	}

	private long unread(Account viewer, String conversationId) throws Exception {
		for (var conversation : json.readTree(client.conversations(viewer.accessToken()).andReturn().getResponse()
				.getContentAsString())) {
			if (conversation.get("id").asString().equals(conversationId)) {
				return conversation.get("unreadCount").asLong();
			}
		}
		throw new AssertionError("conversation not in the list");
	}

	/** The status of each message as the viewer sees it, oldest first; null for messages that are not theirs. */
	private List<String> statuses(Account viewer, String conversationId) throws Exception {
		var statuses = new ArrayList<String>();
		json.readTree(client.history(viewer.accessToken(), conversationId, "limit=100").andReturn().getResponse()
				.getContentAsString()).get("messages")
				.forEach(m -> statuses.add(m.get("status") == null || m.get("status").isNull() ? null
						: m.get("status").asString()));
		return statuses;
	}

	// ---- reporting positions

	@Test
	void reportingReturnsThePositionsAndTheUnreadCount() throws Exception {
		sendFromAda(5);

		client.receipts(grace.accessToken(), direct, 5, 3)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.deliveredSeq").value(5))
				.andExpect(jsonPath("$.readSeq").value(3))
				.andExpect(jsonPath("$.unreadCount").value(2));
	}

	@Test
	void unreadIsTheLastSequenceNumberMinusTheReadPositionAndOwnMessagesNeverCount() throws Exception {
		assertThat(unread(grace, direct)).isZero();
		sendFromAda(5);

		assertThat(unread(grace, direct)).isEqualTo(5);
		assertThat(unread(ada, direct)).as("a sender's own messages are not unread").isZero();

		client.receipts(grace.accessToken(), direct, null, 3).andExpect(status().isOk());
		assertThat(unread(grace, direct)).isEqualTo(2);
		client.receipts(grace.accessToken(), direct, null, 5).andExpect(status().isOk());
		assertThat(unread(grace, direct)).isZero();
		sendFromAda(2);
		assertThat(unread(grace, direct)).isEqualTo(2);
	}

	@Test
	void readingAMessageAlsoCountsAsDelivered() throws Exception {
		sendFromAda(3);

		client.receipts(grace.accessToken(), direct, null, 2)
				.andExpect(jsonPath("$.readSeq").value(2)).andExpect(jsonPath("$.deliveredSeq").value(2));
		client.receipts(grace.accessToken(), direct, 3, null)
				.andExpect(jsonPath("$.readSeq").value(2)).andExpect(jsonPath("$.deliveredSeq").value(3));
	}

	@Test
	void positionsNeverMoveBackwardsAndLowerReportsAreIgnoredWithoutError() throws Exception {
		sendFromAda(5);
		client.receipts(grace.accessToken(), direct, 5, 4).andExpect(status().isOk());

		client.receipts(grace.accessToken(), direct, 2, 1)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.deliveredSeq").value(5))
				.andExpect(jsonPath("$.readSeq").value(4))
				.andExpect(jsonPath("$.unreadCount").value(1));
		client.receipts(grace.accessToken(), direct, 0, 0)
				.andExpect(jsonPath("$.deliveredSeq").value(5)).andExpect(jsonPath("$.readSeq").value(4));
	}

	@Test
	void reportingAMessageThatDoesNotExistYetIsRefused() throws Exception {
		sendFromAda(2);

		client.receipts(grace.accessToken(), direct, null, 3).andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
		client.receipts(grace.accessToken(), direct, 9, null).andExpect(status().isBadRequest());
		client.receipts(grace.accessToken(), direct, 2, 2).andExpect(status().isOk());
	}

	@Test
	void invalidReportsAreValidationErrors() throws Exception {
		sendFromAda(1);

		client.receipts(grace.accessToken(), direct, null, null).andExpect(status().isBadRequest());
		client.receipts(grace.accessToken(), direct, -1, null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.deliveredSeq").isNotEmpty());
		client.receipts(grace.accessToken(), direct, null, -5).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.readSeq").isNotEmpty());
		client.receipts(grace.accessToken(), direct, "abc", null).andExpect(status().isBadRequest());
	}

	@Test
	void onlyParticipantsCanReportAndNobodyCanChangeAnotherPersonsPosition() throws Exception {
		sendFromAda(2);

		client.receipts(linus.accessToken(), direct, 2, 2).andExpect(status().isNotFound());
		client.receipts(grace.accessToken(), UUID.randomUUID().toString(), 1, 1).andExpect(status().isNotFound());
		client.receipts("not-a-jwt", direct, 1, 1).andExpect(status().isUnauthorized());
		assertThat(unread(grace, direct)).isEqualTo(2);
	}

	@Test
	void sendingAdvancesTheSendersOwnPositionsSoARepliedToChatIsRead() throws Exception {
		sendFromAda(3);
		assertThat(unread(grace, direct)).isEqualTo(3);

		client.sendNew(grace.accessToken(), direct, "reply");

		assertThat(unread(grace, direct)).as("replying counts as having read what came before").isZero();
		assertThat(unread(ada, direct)).isEqualTo(1);
		assertThat(statuses(ada, direct).subList(0, 3)).containsOnly("READ");
	}

	// ---- message status

	@Test
	void aSendersMessagesGoFromSentToDeliveredToRead() throws Exception {
		sendFromAda(3);
		assertThat(statuses(ada, direct)).containsExactly("SENT", "SENT", "SENT");

		client.receipts(grace.accessToken(), direct, 2, null).andExpect(status().isOk());
		assertThat(statuses(ada, direct)).containsExactly("DELIVERED", "DELIVERED", "SENT");

		client.receipts(grace.accessToken(), direct, null, 1).andExpect(status().isOk());
		assertThat(statuses(ada, direct)).containsExactly("READ", "DELIVERED", "SENT");

		client.receipts(grace.accessToken(), direct, null, 3).andExpect(status().isOk());
		assertThat(statuses(ada, direct)).containsExactly("READ", "READ", "READ");
	}

	@Test
	void statusIsOnlyShownForTheViewersOwnMessages() throws Exception {
		sendFromAda(2);
		client.sendNew(grace.accessToken(), direct, "from grace");
		client.receipts(ada.accessToken(), direct, 3, 3).andExpect(status().isOk());

		assertThat(statuses(grace, direct)).as("grace sees statuses for her message only")
				.containsExactly(null, null, "READ");
		assertThat(statuses(ada, direct)).containsExactly("READ", "READ", null);
	}

	@Test
	void theSendResponseAndALaterRetryCarryTheCurrentStatus() throws Exception {
		var clientMessageId = UUID.randomUUID().toString();
		client.send(ada.accessToken(), direct, clientMessageId, "hello")
				.andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SENT"));
		client.receipts(grace.accessToken(), direct, null, 1).andExpect(status().isOk());

		client.send(ada.accessToken(), direct, clientMessageId, "hello")
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READ"));
	}

	@Test
	void theConversationListShowsTheLatestMessageWithItsStatusToItsSenderOnly() throws Exception {
		sendFromAda(2);
		client.receipts(grace.accessToken(), direct, 2, null).andExpect(status().isOk());

		client.conversations(ada.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.status").value("DELIVERED"))
				.andExpect(jsonPath("$[0].unreadCount").value(0));
		client.conversations(grace.accessToken())
				.andExpect(jsonPath("$[0].lastMessage.status").doesNotExist())
				.andExpect(jsonPath("$[0].unreadCount").value(2));
	}

	// ---- groups

	private String trio() throws Exception {
		return idOf(client.createGroup(ada.accessToken(), "Pioneers", grace.id(), linus.id())
				.andExpect(status().isCreated()));
	}

	@Test
	void inAGroupAMessageIsDeliveredOrReadOnlyOnceEveryOtherParticipantHasReachedIt() throws Exception {
		var group = trio();
		client.sendNew(ada.accessToken(), group, "one");
		client.sendNew(ada.accessToken(), group, "two");

		client.receipts(grace.accessToken(), group, 2, 2).andExpect(status().isOk());
		client.receipts(linus.accessToken(), group, 1, null).andExpect(status().isOk());
		assertThat(statuses(ada, group)).as("the lagging member holds it back").containsExactly("DELIVERED", "SENT");

		client.receipts(linus.accessToken(), group, 2, 1).andExpect(status().isOk());
		assertThat(statuses(ada, group)).containsExactly("READ", "DELIVERED");

		client.receipts(linus.accessToken(), group, null, 2).andExpect(status().isOk());
		assertThat(statuses(ada, group)).containsExactly("READ", "READ");
	}

	@Test
	void theSendersOwnPositionDoesNotCountTowardsTheirOwnMessages() throws Exception {
		var group = trio();
		client.sendNew(ada.accessToken(), group, "one"); // ada's own cursors jump to 1

		assertThat(statuses(ada, group)).containsExactly("SENT");
	}

	@Test
	void aMemberAddedLaterNeitherHoldsBackNorFakesTheStatusOfOlderMessages() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Pair", grace.id()).andExpect(status().isCreated()));
		client.sendNew(ada.accessToken(), group, "one");
		client.sendNew(ada.accessToken(), group, "two");
		client.receipts(grace.accessToken(), group, 2, 2).andExpect(status().isOk());

		client.addParticipant(ada.accessToken(), group, linus.id()).andExpect(status().isOk());
		assertThat(unread(linus, group)).as("history before the join point is not unread").isZero();
		client.sendNew(ada.accessToken(), group, "three");

		assertThat(statuses(ada, group)).containsExactly("READ", "READ", "SENT");
		assertThat(unread(linus, group)).isEqualTo(1);
		client.receipts(grace.accessToken(), group, 3, 3).andExpect(status().isOk());
		assertThat(statuses(ada, group)).containsExactly("READ", "READ", "SENT");
		client.receipts(linus.accessToken(), group, 3, 3).andExpect(status().isOk());
		assertThat(statuses(ada, group)).containsExactly("READ", "READ", "READ");
	}

	@Test
	void whenALaggingMemberLeavesTheRemainingMembersDecideTheStatus() throws Exception {
		var group = trio();
		client.sendNew(ada.accessToken(), group, "one");
		client.receipts(grace.accessToken(), group, 1, 1).andExpect(status().isOk());
		assertThat(statuses(ada, group)).containsExactly("SENT");

		client.leave(linus.accessToken(), group).andExpect(status().isNoContent());

		assertThat(statuses(ada, group)).containsExactly("READ");
	}

	@Test
	void aMessageWithNoOneElseToReceiveItStaysSent() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Pair", grace.id()).andExpect(status().isCreated()));
		client.sendNew(ada.accessToken(), group, "one");
		client.leave(grace.accessToken(), group).andExpect(status().isNoContent());

		assertThat(statuses(ada, group)).containsExactly("SENT");
		assertThat(unread(ada, group)).isZero();
	}

	// ---- integrity

	@Test
	void concurrentReportsInAnyOrderEndAtTheHighestPosition() throws Exception {
		sendFromAda(20);

		var tasks = new ArrayList<Callable<Integer>>();
		var order = new ArrayList<>(java.util.stream.IntStream.rangeClosed(1, 20).boxed().toList());
		java.util.Collections.shuffle(order);
		for (var n : order) {
			tasks.add(() -> client.receipts(grace.accessToken(), direct, n, n).andReturn().getResponse().getStatus());
		}
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			for (var future : tasks.stream().map(executor::submit).toList()) {
				assertThat(future.get()).isEqualTo(200);
			}
		}

		client.receipts(grace.accessToken(), direct, 0, 0)
				.andExpect(jsonPath("$.deliveredSeq").value(20)).andExpect(jsonPath("$.readSeq").value(20))
				.andExpect(jsonPath("$.unreadCount").value(0));
	}

	@Test
	void theDatabaseRefusesPositionsThatBreakTheOrderingRules() {
		assertThatThrownBy(() -> jdbc.update("update participant set last_read_seq = last_delivered_seq + 1 "
				+ "where conversation_id = ?", UUID.fromString(direct))).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update participant set last_read_seq = -1 where conversation_id = ?",
				UUID.fromString(direct))).isInstanceOf(DataIntegrityViolationException.class);
	}

}
