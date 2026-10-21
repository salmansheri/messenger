package dev.salman.backend.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import dev.salman.backend.entity.Attachment;
import jakarta.persistence.LockModeType;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

	/** Uploads older than {@code cutoff} that no Message refers to, oldest first. */
	@Query("""
			select a from Attachment a
			where a.createdAt < :cutoff and not exists (select m.id from Message m where m.attachmentId = a.id)
			order by a.createdAt
			""")
	List<Attachment> findAbandoned(Instant cutoff, Limit limit);

	/** Locks the upload while it is attached, so two sends cannot both claim it. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from Attachment a where a.id = :id")
	Optional<Attachment> findByIdForUpdate(UUID id);

}
