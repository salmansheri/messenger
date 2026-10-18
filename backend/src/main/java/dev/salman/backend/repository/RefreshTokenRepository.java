package dev.salman.backend.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.RefreshToken;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

	Optional<RefreshToken> findByTokenHash(String tokenHash);

	@Modifying
	@Query("delete from RefreshToken t where t.familyId = :familyId")
	void deleteFamily(UUID familyId);

	@Modifying
	@Query("delete from RefreshToken t where t.userId = :userId")
	void deleteAllForUser(UUID userId);

}
