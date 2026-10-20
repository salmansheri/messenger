package dev.salman.backend.entity;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.UuidGenerator;
import org.hibernate.id.uuid.UuidVersion7Strategy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One Participant's reaction to one Message; at most one per pair. */
@Entity
@Table(name = "reaction")
@Getter
@Setter
@NoArgsConstructor
public class Reaction {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(name = "message_id", nullable = false)
	private UUID messageId;

	@Column(name = "conversation_id", nullable = false)
	private UUID conversationId;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(nullable = false)
	private String emoji;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

}
