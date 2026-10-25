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

/**
 * A Story (GLOSSARY): seen by its poster's audience until {@code expiresAt}, unless it is deleted first. Only a Story
 * that is neither deleted nor expired is ever served, whether or not anything has cleaned it up yet.
 */
@Entity
@Table(name = "story")
@Getter
@Setter
@NoArgsConstructor
public class Story {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(name = "poster_id", nullable = false)
	private UUID posterId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private StoryKind kind;

	private String text;

	@Enumerated(EnumType.STRING)
	private StoryTone tone;

	/** The upload a photo Story shows; null for a text Story and once a photo Story is deleted. */
	@Column(name = "attachment_id")
	private UUID attachmentId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

}
