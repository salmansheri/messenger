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

	Optional<Message> findByIdAndConversationId(UUID id, UUID conversationId);

	/**
	 * The newest Messages after {@code minSeq} (the Participant's join point) that the viewer has not hidden, newest
	 * first.
	 */
	@Query("""
			select m from Message m where m.conversationId = :conversationId and m.seq > :minSeq
			and not exists (select 1 from MessageHidden h where h.messageId = m.id and h.userId = :viewerId)
			order by m.seq desc
			""")
	List<Message> findVisibleNewest(UUID conversationId, UUID viewerId, long minSeq, Limit limit);

	/** Messages between {@code minSeq} and {@code beforeSeq} (both exclusive) the viewer has not hidden, newest first. */
	@Query("""
			select m from Message m where m.conversationId = :conversationId and m.seq > :minSeq and m.seq < :beforeSeq
			and not exists (select 1 from MessageHidden h where h.messageId = m.id and h.userId = :viewerId)
			order by m.seq desc
			""")
	List<Message> findVisibleBefore(UUID conversationId, UUID viewerId, long minSeq, long beforeSeq, Limit limit);

	/** Messages newer than {@code seq} that the viewer has not hidden, oldest first. */
	@Query("""
			select m from Message m where m.conversationId = :conversationId and m.seq > :seq
			and not exists (select 1 from MessageHidden h where h.messageId = m.id and h.userId = :viewerId)
			order by m.seq asc
			""")
	List<Message> findVisibleAfter(UUID conversationId, UUID viewerId, long seq, Limit limit);

	/** The latest Message of each given Conversation that has one, in a single query. */
	@Query("""
			select m from Message m join Conversation c on c.id = m.conversationId
			where c.id in :conversationIds and m.seq = c.lastSeq
			""")
	List<Message> findLatestIn(Collection<UUID> conversationIds);

}
