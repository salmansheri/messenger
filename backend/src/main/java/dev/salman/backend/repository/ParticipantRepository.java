package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.salman.backend.entity.Participant;

public interface ParticipantRepository extends JpaRepository<Participant, UUID> {

	List<Participant> findByConversationIdIn(Collection<UUID> conversationIds);

	boolean existsByConversationIdAndUserId(UUID conversationId, UUID userId);

	Optional<Participant> findByConversationIdAndUserId(UUID conversationId, UUID userId);

	List<Participant> findByConversationId(UUID conversationId);

	long countByConversationId(UUID conversationId);

}
