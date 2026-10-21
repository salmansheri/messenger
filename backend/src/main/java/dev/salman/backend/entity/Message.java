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

@Entity
@Table(name = "message")
@Getter
@Setter
@NoArgsConstructor
public class Message {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(name = "conversation_id", nullable = false)
	private UUID conversationId;

	@Column(nullable = false)
	private long seq;

	@Column(name = "sender_id", nullable = false)
	private UUID senderId;

	@Column(name = "client_message_id", nullable = false)
	private UUID clientMessageId;

	/** The text, or caption of an image. Null once the Message is deleted for everyone, or for an image sent alone. */
	private String body;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "edited_at")
	private Instant editedAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	/** The Message this one answers (always in the same Conversation), or null. */
	@Column(name = "reply_to_id")
	private UUID replyToId;

	/** The uploaded image sent with this Message, or null. */
	@Column(name = "attachment_id")
	private UUID attachmentId;

	public boolean isDeleted() {
		return deletedAt != null;
	}

}
