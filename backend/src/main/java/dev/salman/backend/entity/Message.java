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

	/** The Story this one answers while that Story exists, or null (see {@link #repliedToStory}). */
	@Column(name = "reply_to_story_id")
	private UUID replyToStoryId;

	/** Whether this Message answers a Story; stays true after the Story has gone and the reference is cleared. */
	@Column(name = "replied_to_story", nullable = false)
	private boolean repliedToStory;

	/** The uploaded image sent with this Message, or null. */
	@Column(name = "attachment_id")
	private UUID attachmentId;

	/**
	 * The User this Message is withheld from (a Withheld Message: its sender was blocked by them when it was stored),
	 * or null. Set once, never cleared.
	 */
	@Column(name = "withheld_from")
	private UUID withheldFrom;

	public boolean isDeleted() {
		return deletedAt != null;
	}

	/** Whether this is a Withheld Message that {@code userId} must never see. */
	public boolean isWithheldFrom(UUID userId) {
		return withheldFrom != null && withheldFrom.equals(userId);
	}

	/** Whether this is a Withheld Message (from anyone). */
	public boolean isWithheld() {
		return withheldFrom != null;
	}

}
