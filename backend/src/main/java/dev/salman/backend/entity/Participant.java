package dev.salman.backend.entity;

import java.time.Instant;
import java.util.UUID;

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

}
