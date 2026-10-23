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

/** A Block: {@code blockerId} stopped {@code blockedId} reaching them (one way; see ADR 0006). */
@Entity
@Table(name = "user_block")
@Getter
@Setter
@NoArgsConstructor
public class UserBlock {

	@Id
	@GeneratedValue
	@UuidGenerator(algorithm = UuidVersion7Strategy.class)
	private UUID id;

	@Column(name = "blocker_id", nullable = false)
	private UUID blockerId;

	@Column(name = "blocked_id", nullable = false)
	private UUID blockedId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

}
