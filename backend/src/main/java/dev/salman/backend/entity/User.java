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

/**
 * {@code @DynamicUpdate}: only changed columns are written, so changing a loaded copy (say, the password hash) can never
 * write an old {@code last_seen_at} back over a newer one recorded separately by {@code updateLastSeen}.
 */
@DynamicUpdate
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(nullable = false, unique = true)
	private String email;

	@Column(name = "display_name", nullable = false)
	private String displayName;

	/** The object key of the avatar, or null for none. */
	@Column(name = "avatar_key")
	private String avatarKey;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Column(name = "email_verified", nullable = false)
	private boolean emailVerified;

	@Column(name = "created_at", nullable = false, insertable = false, updatable = false)
	private Instant createdAt;

	/** How the User says they can be reached; only informs others. */
	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Availability availability = Availability.AVAILABLE;

	@Column(name = "last_seen_at")
	private Instant lastSeenAt;

}
