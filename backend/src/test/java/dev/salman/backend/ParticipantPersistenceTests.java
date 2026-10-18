package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import dev.salman.backend.entity.ParticipantRole;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

/**
 * Receipt positions are advanced by a single atomic UPDATE and must never be rewritten from a stale copy of the row.
 * The window (between loading a Participant and flushing it) cannot be hit through HTTP, so this goes through the
 * repository.
 */
class ParticipantPersistenceTests extends IntegrationTest {

	@Autowired
	ParticipantRepository participants;

	@Autowired
	PlatformTransactionManager transactions;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void changingAParticipantsRoleNeverOverwritesReceiptPositionsAdvancedInTheMeantime() throws Exception {
		var client = auth();
		var ada = client.account("Ada Lovelace");
		var grace = client.account("Grace Hopper");
		var group = json.readTree(client.createGroup(ada.accessToken(), "Pair", grace.id()).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString()).get("id").asString();
		for (int i = 1; i <= 3; i++) {
			client.sendNew(ada.accessToken(), group, "message " + i);
		}
		var conversationId = UUID.fromString(group);
		var graceId = UUID.fromString(grace.id());

		new TransactionTemplate(transactions).executeWithoutResult(tx -> {
			var loaded = participants.findByConversationIdAndUserId(conversationId, graceId).orElseThrow();
			assertThat(loaded.getLastReadSeq()).isZero();

			// Meanwhile Grace's client reports its positions, in its own transaction, and that commits.
			var other = new TransactionTemplate(transactions);
			other.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
			other.executeWithoutResult(inner -> participants.advanceReceipts(conversationId, graceId, 3, 3));

			loaded.setRole(ParticipantRole.ADMIN); // flushed at commit from the stale copy
		});

		var row = jdbc.queryForMap("select role, last_delivered_seq, last_read_seq from participant "
				+ "where conversation_id = ? and user_id = ?", conversationId, graceId);
		assertThat(row.get("role")).isEqualTo("ADMIN");
		assertThat(((Number) row.get("last_read_seq")).longValue()).as("read position survived").isEqualTo(3);
		assertThat(((Number) row.get("last_delivered_seq")).longValue()).as("delivered position survived").isEqualTo(3);
	}

}
