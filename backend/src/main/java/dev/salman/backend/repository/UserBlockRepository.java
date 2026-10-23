package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.UserBlock;

public interface UserBlockRepository extends JpaRepository<UserBlock, UUID> {

	Optional<UserBlock> findByBlockerIdAndBlockedId(UUID blockerId, UUID blockedId);

	boolean existsByBlockerIdAndBlockedId(UUID blockerId, UUID blockedId);

	/** The blocker's Blocks, newest first. */
	List<UserBlock> findByBlockerIdOrderByCreatedAtDescIdDesc(UUID blockerId);

	/** Which of these Users the blocker has blocked. */
	@Query("select b.blockedId from UserBlock b where b.blockerId = :blockerId and b.blockedId in :userIds")
	List<UUID> findBlockedAmong(UUID blockerId, Collection<UUID> userIds);

}
