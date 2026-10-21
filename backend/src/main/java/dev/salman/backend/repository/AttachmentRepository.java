package dev.salman.backend.repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import dev.salman.backend.entity.Attachment;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

	/** Uploads nobody sent with a Message, oldest first. */
	List<Attachment> findByMessageIdIsNullAndCreatedAtBefore(Instant cutoff, Limit limit);

}
