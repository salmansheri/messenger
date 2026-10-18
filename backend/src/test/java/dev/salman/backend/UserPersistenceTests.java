package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

/** The same stale-write hazard as for participants: a loaded User must never overwrite a newer last-seen time. */
class UserPersistenceTests extends IntegrationTest {

	@Autowired
	UserRepository users;

	@Autowired
	PlatformTransactionManager transactions;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void changingAUserNeverOverwritesALastSeenTimeRecordedInTheMeantime() throws Exception {
		var account = auth().account("Ada Lovelace");
		var id = UUID.fromString(account.id());
		var seen = Instant.now().truncatedTo(ChronoUnit.MICROS);

		new TransactionTemplate(transactions).executeWithoutResult(tx -> {
			var loaded = users.findById(id).orElseThrow();
			assertThat(loaded.getLastSeenAt()).isNull();

			var other = new TransactionTemplate(transactions);
			other.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
			other.executeWithoutResult(inner -> users.updateLastSeen(id, seen));

			loaded.setDisplayName("Ada Renamed"); // flushed at commit from the stale copy
		});

		var row = jdbc.queryForMap("select display_name, last_seen_at from users where id = ?", id);
		assertThat(row.get("display_name")).isEqualTo("Ada Renamed");
		assertThat(row.get("last_seen_at")).as("the last-seen time survived").isNotNull();
		assertThat(((java.sql.Timestamp) row.get("last_seen_at")).toInstant()).isEqualTo(seen);
	}

}
