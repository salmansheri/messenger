package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.RefreshToken;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

	Optional<RefreshToken> findByTokenHash(String tokenHash);

	/** Marks the token used unless it already was; returns 1 only for the caller that won. */
	@Modifying
	@Query("update RefreshToken t set t.usedAt = :now where t.id = :id and t.usedAt is null")
	int markUsed(UUID id, Instant now);

	@Modifying
	@Query("delete from RefreshToken t where t.familyId = :familyId")
	void deleteFamily(UUID familyId);

	@Modifying
	@Query("delete from RefreshToken t where t.userId = :userId")
	void deleteAllForUser(UUID userId);

}
