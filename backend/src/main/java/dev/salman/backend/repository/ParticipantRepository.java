package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.salman.backend.entity.Participant;

public interface ParticipantRepository extends JpaRepository<Participant, UUID> {

	List<Participant> findByConversationIdIn(Collection<UUID> conversationIds);

}
