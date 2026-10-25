package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Message;

public interface MessageRepository extends JpaRepository<Message, UUID> {

	Optional<Message> findByConversationIdAndSenderIdAndClientMessageId(UUID conversationId, UUID senderId,
			UUID clientMessageId);

	Optional<Message> findByIdAndConversationId(UUID id, UUID conversationId);

	boolean existsByAttachmentId(UUID attachmentId);

	/** Lets go of a Story that is being deleted: the Messages answering it keep only that they answered a Story. */
	@Modifying
	@Query("update Message m set m.replyToStoryId = null where m.replyToStoryId = :storyId")
	void clearReplyToStory(UUID storyId);

	/**
	 * The newest Messages after {@code minSeq} (the Participant's join point) that the viewer has not hidden and that
	 * are not withheld from them, newest first. Every "visible" query below skips both.
	 */
	@Query("""
			select m from Message m where m.conversationId = :conversationId and m.seq > :minSeq
			and not exists (select 1 from MessageHidden h where h.messageId = m.id and h.userId = :viewerId)
			and (m.withheldFrom is null or m.withheldFrom <> :viewerId)
			order by m.seq desc
			""")
	List<Message> findVisibleNewest(UUID conversationId, UUID viewerId, long minSeq, Limit limit);

	/** Messages between {@code minSeq} and {@code beforeSeq} (both exclusive) the viewer has not hidden, newest first. */
	@Query("""
			select m from Message m where m.conversationId = :conversationId and m.seq > :minSeq and m.seq < :beforeSeq
			and not exists (select 1 from MessageHidden h where h.messageId = m.id and h.userId = :viewerId)
			and (m.withheldFrom is null or m.withheldFrom <> :viewerId)
			order by m.seq desc
			""")
	List<Message> findVisibleBefore(UUID conversationId, UUID viewerId, long minSeq, long beforeSeq, Limit limit);

	/** Messages newer than {@code seq} that the viewer has not hidden, oldest first. */
	@Query("""
			select m from Message m where m.conversationId = :conversationId and m.seq > :seq
			and not exists (select 1 from MessageHidden h where h.messageId = m.id and h.userId = :viewerId)
			and (m.withheldFrom is null or m.withheldFrom <> :viewerId)
			order by m.seq asc
			""")
	List<Message> findVisibleAfter(UUID conversationId, UUID viewerId, long seq, Limit limit);

	/** How many Messages of a Conversation, withheld from the viewer, the viewer has not read past: per Conversation. */
	interface WithheldCount {

		UUID getConversationId();

		long getCount();

	}

	/**
	 * For each given Conversation of the viewer, the Messages withheld from them after their read position (only
	 * Conversations that have any). They are left out of the viewer's unread count.
	 */
	@Query("""
			select m.conversationId as conversationId, count(m) as count from Message m, Participant p
			where p.conversationId = m.conversationId and p.userId = :viewerId and m.conversationId in :conversationIds
			and m.withheldFrom = :viewerId and m.seq > p.lastReadSeq
			group by m.conversationId
			""")
	List<WithheldCount> countWithheldUnread(UUID viewerId, Collection<UUID> conversationIds);

	/** The first Withheld Message of each sender in a Conversation: how far that sender's receipts may ever go. */
	interface FirstWithheld {

		UUID getSenderId();

		long getSeq();

	}

	@Query("""
			select m.senderId as senderId, min(m.seq) as seq from Message m
			where m.conversationId = :conversationId and m.withheldFrom is not null
			group by m.senderId
			""")
	List<FirstWithheld> findFirstWithheldBySender(UUID conversationId);

	/** The Users some Message of this Conversation is withheld from. */
	@Query("select distinct m.withheldFrom from Message m where m.conversationId = :conversationId and m.withheldFrom is not null")
	List<UUID> findWithheldFrom(UUID conversationId);

	/** The Sequence number of the latest Message of the Conversation not withheld from the User (0 for none). */
	@Query("""
			select coalesce(max(m.seq), 0) from Message m where m.conversationId = :conversationId
			and (m.withheldFrom is null or m.withheldFrom <> :userId)
			""")
	long findLatestSeqNotWithheldFrom(UUID conversationId, UUID userId);

	/** When a Conversation last had activity the viewer can see (null: none of its Messages). */
	interface VisibleActivity {

		UUID getConversationId();

		Instant getLatestVisibleAt();

	}

	/**
	 * For each given Conversation holding Messages withheld from the viewer (only those, through the partial index),
	 * when the latest Message not withheld from them was sent. Withheld Messages are not activity for the blocker.
	 * The latest one is found by Sequence number, so the {@code (conversation_id, seq)} index is read backwards from
	 * the end rather than the whole history.
	 */
	@Query("""
			select w.conversationId as conversationId,
			       (select m.createdAt from Message m where m.conversationId = w.conversationId
			        and m.seq = (select max(n.seq) from Message n where n.conversationId = w.conversationId
			                     and (n.withheldFrom is null or n.withheldFrom <> :viewerId))) as latestVisibleAt
			from Message w
			where w.withheldFrom = :viewerId and w.conversationId in :conversationIds
			group by w.conversationId
			""")
	List<VisibleActivity> findVisibleActivity(UUID viewerId, Collection<UUID> conversationIds);

	/** The latest Message of each given Conversation that has one, in a single query. */
	@Query("""
			select m from Message m join Conversation c on c.id = m.conversationId
			where c.id in :conversationIds and m.seq = c.lastSeq
			""")
	List<Message> findLatestIn(Collection<UUID> conversationIds);

	/**
	 * Search in one Conversation (migration V16, configuration {@code message_search}): Messages with text after
	 * {@code minSeq} (the viewer's join point) that are not deleted, not hidden by or withheld from the viewer and
	 * match the query, newest first, older than the cursor {@code (beforeAt, beforeId)}. The query is
	 * {@code message_search_query} of {@code words} and {@code prefix}; one with nothing to look for but exclusions
	 * ({@code -word} alone, whose {@code querytree} is {@code T}) finds nothing rather than everything else.
	 */
	@Query(value = """
			select m.* from message m
			cross join message_search_query(:words, :prefix) q
			where m.conversation_id = :conversationId and m.seq > :minSeq and m.deleted_at is null
			and m.body is not null and querytree(q) <> 'T' and m.search_vector @@ q
			and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = :viewerId)
			and (m.withheld_from is null or m.withheld_from <> :viewerId)
			and (m.created_at, m.id) < (:beforeAt, :beforeId)
			order by m.created_at desc, m.id desc
			limit :limit
			""", nativeQuery = true)
	List<Message> searchConversation(UUID conversationId, UUID viewerId, long minSeq, String words, String prefix,
			Instant beforeAt, UUID beforeId, int limit);

	/**
	 * Search in every Conversation the viewer is a Participant of now (a Conversation left or removed from has no row,
	 * so it is not searched), each from after that Conversation's own join point, with the same exclusions, query and
	 * order as {@link #searchConversation}.
	 */
	@Query(value = """
			select m.* from message m
			join participant p on p.conversation_id = m.conversation_id and p.user_id = :viewerId
			cross join message_search_query(:words, :prefix) q
			where m.seq > p.joined_after_seq and m.deleted_at is null
			and m.body is not null and querytree(q) <> 'T' and m.search_vector @@ q
			and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = :viewerId)
			and (m.withheld_from is null or m.withheld_from <> :viewerId)
			and (m.created_at, m.id) < (:beforeAt, :beforeId)
			order by m.created_at desc, m.id desc
			limit :limit
			""", nativeQuery = true)
	List<Message> searchAll(UUID viewerId, String words, String prefix, Instant beforeAt, UUID beforeId, int limit);

	/** A found Message's snippet: its text around the matches, marked as {@code options} say. */
	interface Snippet {

		UUID getId();

		String getSnippet();

	}

	/**
	 * The snippets of the given Messages for the same query as the search ({@code ts_headline}), with the characters
	 * in {@code markers} taken out of the text first so only the server's marks are in it.
	 */
	@Query(value = """
			select m.id as id,
			       ts_headline('message_search', translate(m.body, :markers, ''), q, :options) as snippet
			from message m cross join message_search_query(:words, :prefix) q
			where m.id in (:ids) and m.body is not null
			""", nativeQuery = true)
	List<Snippet> snippets(Collection<UUID> ids, String words, String prefix, String markers, String options);

}
