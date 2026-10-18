package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Participant;

public interface ParticipantRepository extends JpaRepository<Participant, UUID> {

	List<Participant> findByConversationIdIn(Collection<UUID> conversationIds);

	/** Everyone who shares at least one Conversation with the User (not the User). */
	@Query("select distinct other.userId from Participant mine, Participant other "
			+ "where mine.userId = :userId and other.conversationId = mine.conversationId and other.userId <> :userId")
	List<UUID> findCoParticipantIds(UUID userId);

	boolean existsByConversationIdAndUserId(UUID conversationId, UUID userId);

	Optional<Participant> findByConversationIdAndUserId(UUID conversationId, UUID userId);

	List<Participant> findByConversationId(UUID conversationId);

	long countByConversationId(UUID conversationId);

	/** A Participant's receipt positions without loading the entity, so nothing stale lingers in the session. */
	interface Positions {

		long getDeliveredSeq();

		long getReadSeq();

	}

	@Query("select p.lastDeliveredSeq as deliveredSeq, p.lastReadSeq as readSeq from Participant p "
			+ "where p.conversationId = :conversationId and p.userId = :userId")
	Optional<Positions> findPositions(UUID conversationId, UUID userId);

	/**
	 * Moves the Participant's receipt positions forward to at least the given values, atomically: a lower value, or
	 * one that arrives late or concurrently, changes nothing. {@code delivered} must not be below {@code read}.
	 *
	 * @return the number of rows updated (0 when the Participant is not in the Conversation)
	 */
	@Modifying
	@Query(value = """
			update participant
			set last_delivered_seq = greatest(last_delivered_seq, :delivered),
			    last_read_seq = greatest(last_read_seq, :read)
			where conversation_id = :conversationId and user_id = :userId
			""", nativeQuery = true)
	int advanceReceipts(UUID conversationId, UUID userId, long delivered, long read);

}
