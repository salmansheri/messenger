package dev.salman.backend.entity;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.id.uuid.UuidVersion7Strategy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A User's membership in a Conversation. */
/**
 * {@code @DynamicUpdate}: only the columns that changed are written. The receipt positions are advanced by a separate
 * atomic UPDATE (see {@code ParticipantRepository.advanceReceipts}), so changing, say, the role of a copy loaded
 * earlier must never write its old positions back over newer ones.
 */
@DynamicUpdate
@Entity
@Table(name = "participant")
@Getter
@Setter
@NoArgsConstructor
public class Participant {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(name = "conversation_id", nullable = false)
	private UUID conversationId;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private ParticipantRole role = ParticipantRole.MEMBER;

	@Column(name = "joined_at", nullable = false)
	private Instant joinedAt;

	/** Messages with a Sequence number up to this were sent before the Participant joined and are not theirs to read. */
	@Column(name = "joined_after_seq", nullable = false)
	private long joinedAfterSeq;

	/** The latest Message this Participant's client has confirmed receiving. Only ever moves forward. */
	@Column(name = "last_delivered_seq", nullable = false)
	private long lastDeliveredSeq;

	/** The latest Message this Participant has seen; never above the delivered position. Only moves forward. */
	@Column(name = "last_read_seq", nullable = false)
	private long lastReadSeq;

	/** Push notifications from this Conversation are silenced until this time (unless muted for ever). */
	@Column(name = "muted_until")
	private Instant mutedUntil;

	@Column(name = "muted_forever", nullable = false)
	private boolean mutedForever;

	@Column(nullable = false)
	private boolean archived;

	@Column(nullable = false)
	private boolean pinned;

	public static Participant joining(UUID conversationId, UUID userId, ParticipantRole role, Instant joinedAt,
			long joinedAfterSeq) {
		var participant = new Participant();
		participant.setConversationId(conversationId);
		participant.setUserId(userId);
		participant.setRole(role);
		participant.setJoinedAt(joinedAt);
		participant.setJoinedAfterSeq(joinedAfterSeq);
		// Nothing from before they joined is delivered to them or unread by them.
		participant.setLastDeliveredSeq(joinedAfterSeq);
		participant.setLastReadSeq(joinedAfterSeq);
		return participant;
	}

	/** Whether push notifications are silenced at {@code now}; a mute with an end time lapses on its own. */
	public boolean isMuted(Instant now) {
		return mutedForever || (mutedUntil != null && mutedUntil.isAfter(now));
	}

	/** Whether a Message with this Sequence number was sent after the Participant joined, so they may read it. */
	public boolean canRead(long seq) {
		return seq > joinedAfterSeq;
	}

	/**
	 * How many Messages up to {@code lastSeq} this Participant has not read yet (see the glossary), leaving out the
	 * {@code withheld} ones after their read position that are withheld from them (ADR 0006). Messages they hid for
	 * themselves still count.
	 */
	public long unreadCount(long lastSeq, long withheld) {
		return Math.max(0, lastSeq - lastReadSeq - withheld);
	}

	/** The cursor to read after: the caller's own cursor, but never before their join point. */
	public long readableAfter(long cursor) {
		return Math.max(cursor, joinedAfterSeq);
	}

}
