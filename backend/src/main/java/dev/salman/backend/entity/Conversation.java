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

@Entity
@Table(name = "conversation")
@Getter
@Setter
@NoArgsConstructor
public class Conversation {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private ConversationType type;

	private String name;

	@Column(name = "direct_key", unique = true)
	private String directKey;

	@Column(name = "last_seq", nullable = false)
	private long lastSeq;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	/** Both User ids in a fixed order, so the key of a pair's Direct conversation is the same whoever starts it. */
	public static String directKey(UUID first, UUID second) {
		var a = first.toString();
		var b = second.toString();
		return a.compareTo(b) < 0 ? a + ":" + b : b + ":" + a;
	}

}
