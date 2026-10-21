package dev.salman.backend.entity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** An image a User uploaded: stored in object storage, linked to a Message once it is sent with one. */
@Entity
@Table(name = "attachment")
@Getter
@Setter
@NoArgsConstructor
public class Attachment {

	@Id
	private UUID id;

	@Column(name = "owner_id", nullable = false)
	private UUID ownerId;

	@Column(name = "storage_key", nullable = false)
	private String storageKey;

	@Column(name = "thumbnail_key", nullable = false)
	private String thumbnailKey;

	@Column(name = "content_type", nullable = false)
	private String contentType;

	@Column(name = "size_bytes", nullable = false)
	private long sizeBytes;

	@Column(nullable = false)
	private int width;

	@Column(nullable = false)
	private int height;

	@Column(name = "message_id")
	private UUID messageId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

}
