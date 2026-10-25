package dev.salman.backend.entity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A Story view (GLOSSARY): one person saw one Story, first at {@code viewedAt}. Written only by a native insert. */
@Entity
@Table(name = "story_view")
@Getter
@NoArgsConstructor
public class StoryView {

	@Id
	private UUID id;

	@Column(name = "story_id", nullable = false)
	private UUID storyId;

	@Column(name = "viewer_id", nullable = false)
	private UUID viewerId;

	@Column(name = "viewed_at", nullable = false)
	private Instant viewedAt;

}
