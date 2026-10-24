package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

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

	@Query("select count(s) from Story s where s.posterId = :posterId and s.deletedAt is null and s.expiresAt > :now")
	long countLive(UUID posterId, Instant now);

}
