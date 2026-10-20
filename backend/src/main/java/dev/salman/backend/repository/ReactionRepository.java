package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Reaction;

public interface ReactionRepository extends JpaRepository<Reaction, UUID> {

	Optional<Reaction> findByMessageIdAndUserId(UUID messageId, UUID userId);

	/** Every reaction to these Messages, earliest first, in one query. */
	List<Reaction> findByMessageIdInOrderByCreatedAtAscIdAsc(Collection<UUID> messageIds);

	/** Takes away everything this User reacted with in the Conversation (they left or were removed); how many there were. */
	@Modifying
	@Query("delete from Reaction r where r.conversationId = :conversationId and r.userId = :userId")
	int deleteByConversationIdAndUserId(UUID conversationId, UUID userId);

}
