package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.entity.User;
import jakarta.persistence.LockModeType;

public interface UserRepository extends JpaRepository<User, UUID> {

	Optional<User> findByEmail(String email);

	/**
	 * Loads the User and locks the row until the transaction ends. Sign-in, token refresh and password reset all take
	 * this lock, so a session can never be created from a password that a concurrent reset has just replaced.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.email = :email")
	Optional<User> findByEmailForUpdate(String email);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.id = :id")
	Optional<User> findByIdForUpdate(UUID id);

	/** Records when the User was last connected; touches that one column only. */
	@Transactional
	@Modifying
	@Query("update User u set u.lastSeenAt = :at where u.id = :id")
	void updateLastSeen(UUID id, Instant at);

}
