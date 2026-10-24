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

	/** The Blocks any of these Users made against any of those. */
	List<UserBlock> findByBlockerIdInAndBlockedIdIn(Collection<UUID> blockerIds, Collection<UUID> blockedIds);

	/**
	 * Who in this Conversation blocks the User: the other Participant of a Direct conversation that blocked them, or
	 * nobody (a Group never hides anyone's actions).
	 */
	@Query("""
			select b.blockerId from UserBlock b, Conversation c, Participant p
			where c.id = :conversationId and c.type = dev.salman.backend.entity.ConversationType.DIRECT
			and p.conversationId = c.id and p.userId = b.blockerId and b.blockedId = :userId
			""")
	List<UUID> findBlockersInDirect(UUID conversationId, UUID userId);

}
