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

/** A Message one User hid from their own view ("delete for me"). Written by {@code MessageHiddenRepository}. */
@Entity
@Table(name = "message_hidden")
@Getter
@NoArgsConstructor
public class MessageHidden {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "message_id", nullable = false)
	private UUID messageId;

	@Column(name = "conversation_id", nullable = false)
	private UUID conversationId;

	@Column(name = "hidden_at", nullable = false)
	private Instant hiddenAt;

}
