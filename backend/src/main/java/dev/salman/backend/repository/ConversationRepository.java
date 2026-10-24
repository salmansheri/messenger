package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Conversation;
import jakarta.persistence.LockModeType;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

	Optional<Conversation> findByDirectKey(String directKey);

	/**
	 * Loads the Conversation and locks its row until the transaction ends. Sending takes this lock, so Messages are
	 * stored one at a time per Conversation and the Sequence number is incremented without gaps or duplicates.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Conversation c where c.id = :id")
	Optional<Conversation> findByIdForUpdate(UUID id);

	/** Which of these Conversations are Direct ones. */
	@Query("select c.id from Conversation c where c.id in :ids and c.type = dev.salman.backend.entity.ConversationType.DIRECT")
	List<UUID> findDirectAmong(Collection<UUID> ids);

	/** The caller's Conversations, most recently active first. */
	@Query("""
			select c from Conversation c
			where c.id in (select p.conversationId from Participant p where p.userId = :userId)
			order by c.updatedAt desc, c.id desc
			""")
	List<Conversation> findAllForUser(UUID userId);

	/**
	 * Takes a transaction-scoped advisory lock for the key, so two transactions creating the same Direct conversation
	 * run one after the other. The second then sees the first one's row instead of colliding with it.
	 */
	@Query(value = "select count(*) from (select pg_advisory_xact_lock(hashtextextended(:key, 0))) locked",
			nativeQuery = true)
	long lockDirectKey(String key);

}
