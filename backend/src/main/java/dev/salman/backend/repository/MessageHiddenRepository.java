package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.salman.backend.entity.MessageHidden;

public interface MessageHiddenRepository extends JpaRepository<MessageHidden, UUID> {

	/** Hides the Message for the User; hiding it again changes nothing, even when two requests race. */
	@Modifying
	@Query(value = """
			insert into message_hidden (id, user_id, message_id, conversation_id, hidden_at)
			values (gen_random_uuid(), :userId, :messageId, :conversationId, :hiddenAt)
			on conflict (user_id, message_id) do nothing
			""", nativeQuery = true)
	void hide(@Param("userId") UUID userId, @Param("messageId") UUID messageId,
			@Param("conversationId") UUID conversationId, @Param("hiddenAt") Instant hiddenAt);

	/** Which of these Messages the User has hidden. */
	@Query("select h.messageId from MessageHidden h where h.userId = :userId and h.messageId in :messageIds")
	List<UUID> findHiddenAmong(UUID userId, Collection<UUID> messageIds);

	/** Everyone who has hidden this Message from their own view. */
	@Query("select h.userId from MessageHidden h where h.messageId = :messageId")
	List<UUID> findUserIdsWhoHid(UUID messageId);

}
