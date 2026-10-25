package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.salman.backend.entity.Story;
import jakarta.persistence.LockModeType;

public interface StoryRepository extends JpaRepository<Story, UUID> {

	/** The live Stories of these posters, oldest first. */
	@Query("""
			select s from Story s where s.posterId in :posterIds and s.deletedAt is null and s.expiresAt > :now
			order by s.createdAt, s.id
			""")
	List<Story> findLiveByPosters(Collection<UUID> posterIds, Instant now);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select s from Story s where s.id = :id")
	Optional<Story> findByIdForUpdate(UUID id);

	/** Whether a Story shows this upload (a deleted one no longer does). */
	boolean existsByAttachmentId(UUID attachmentId);

	/**
	 * Up to {@code limit} Stories past their expiry (deleted ones included), oldest first, locked; rows another
	 * instance's sweep has locked are skipped, so sweeps on several instances never take the same Story.
	 */
	@Query(value = """
			select * from story where expires_at <= :now order by expires_at limit :limit for update skip locked
			""", nativeQuery = true)
	List<Story> findExpiredForSweep(@Param("now") Instant now, @Param("limit") int limit);

	@Query("select count(s) from Story s where s.posterId = :posterId and s.deletedAt is null and s.expiresAt > :now")
	long countLive(UUID posterId, Instant now);

}
