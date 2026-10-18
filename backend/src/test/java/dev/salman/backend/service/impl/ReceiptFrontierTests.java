package dev.salman.backend.service.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.ParticipantRole;

/** Pure logic, no context: how far everyone else has got, from one Participant's point of view. */
class ReceiptFrontierTests {

	private static final UUID ADA = UUID.randomUUID();
	private static final UUID GRACE = UUID.randomUUID();
	private static final UUID LINUS = UUID.randomUUID();

	private static Participant at(UUID user, long delivered, long read) {
		var p = Participant.joining(UUID.randomUUID(), user, ParticipantRole.MEMBER, Instant.EPOCH, 0);
		p.setLastDeliveredSeq(delivered);
		p.setLastReadSeq(read);
		return p;
	}

	@Test
	void theFrontierIsTheLowestPositionAmongEveryoneElse() {
		var members = List.of(at(ADA, 9, 9), at(GRACE, 5, 3), at(LINUS, 7, 6));

		assertThat(ReceiptFrontier.ofOthers(ADA, members)).isEqualTo(new ReceiptFrontier(5, 3));
		assertThat(ReceiptFrontier.ofOthers(GRACE, members)).isEqualTo(new ReceiptFrontier(7, 6));
		assertThat(ReceiptFrontier.ofOthers(LINUS, members)).isEqualTo(new ReceiptFrontier(5, 3));
	}

	@Test
	void withNobodyElseNothingCountsAsDeliveredOrRead() {
		assertThat(ReceiptFrontier.ofOthers(ADA, List.of(at(ADA, 4, 4)))).isEqualTo(new ReceiptFrontier(0, 0));
		assertThat(ReceiptFrontier.ofOthers(ADA, List.of())).isEqualTo(new ReceiptFrontier(0, 0));
	}

	@Test
	void aReporterCanBeShownAtTheirEarlierPositions() {
		var members = List.of(at(ADA, 9, 9), at(GRACE, 8, 8), at(LINUS, 2, 1));

		// Ada's view while Grace was still at 3/2: Grace was the lowest, not Linus.
		assertThat(ReceiptFrontier.ofOthers(ADA, members, GRACE, 0, 0)).isEqualTo(new ReceiptFrontier(0, 0));
		assertThat(ReceiptFrontier.ofOthers(ADA, members)).isEqualTo(new ReceiptFrontier(2, 1));
	}

	@Test
	void aMessageIsReadOnlyOnceTheLowestReadPositionHasReachedIt() {
		var frontier = new ReceiptFrontier(5, 3);

		assertThat(frontier.statusOf(3)).isEqualTo(MessageStatus.READ);
		assertThat(frontier.statusOf(4)).isEqualTo(MessageStatus.DELIVERED);
		assertThat(frontier.statusOf(5)).isEqualTo(MessageStatus.DELIVERED);
		assertThat(frontier.statusOf(6)).isEqualTo(MessageStatus.SENT);
	}

}
