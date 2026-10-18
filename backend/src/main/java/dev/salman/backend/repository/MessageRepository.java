package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Message;

public interface MessageRepository extends JpaRepository<Message, UUID> {

	Optional<Message> findByConversationIdAndSenderIdAndClientMessageId(UUID conversationId, UUID senderId,
			UUID clientMessageId);

	/** The newest messages, newest first. */
	List<Message> findByConversationIdOrderBySeqDesc(UUID conversationId, Limit limit);

	/** Messages older than {@code seq}, newest first. */
	List<Message> findByConversationIdAndSeqLessThanOrderBySeqDesc(UUID conversationId, long seq, Limit limit);

	/** Messages newer than {@code seq}, oldest first. */
	List<Message> findByConversationIdAndSeqGreaterThanOrderBySeqAsc(UUID conversationId, long seq, Limit limit);

	/** The latest Message of each given Conversation that has one, in a single query. */
	@Query("""
			select m from Message m join Conversation c on c.id = m.conversationId
			where c.id in :conversationIds and m.seq = c.lastSeq
			""")
	List<Message> findLatestIn(Collection<UUID> conversationIds);

}
