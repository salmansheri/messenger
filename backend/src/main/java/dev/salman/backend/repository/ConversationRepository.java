package dev.salman.backend.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Conversation;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

	Optional<Conversation> findByDirectKey(String directKey);

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
