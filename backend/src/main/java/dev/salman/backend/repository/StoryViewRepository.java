package dev.salman.backend.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.salman.backend.entity.StoryView;

/**
 * Story views. Counts and lists leave out anyone the poster blocks or who blocks the poster, worked out at each read,
 * so an Unblock brings their views back.
 */
public interface StoryViewRepository extends JpaRepository<StoryView, UUID> {

	/** Records the view; answers 1 for a first view and 0 when it was already recorded, even when two requests race. */
	@Modifying
	@Query(value = """
			insert into story_view (id, story_id, viewer_id, viewed_at)
			values (gen_random_uuid(), :storyId, :viewerId, :viewedAt)
			on conflict (story_id, viewer_id) do nothing
			""", nativeQuery = true)
	int record(@Param("storyId") UUID storyId, @Param("viewerId") UUID viewerId, @Param("viewedAt") Instant viewedAt);

	/** Which of these Stories the viewer has seen. */
	@Query("select v.storyId from StoryView v where v.viewerId = :viewerId and v.storyId in :storyIds")
	List<UUID> findSeenAmong(UUID viewerId, Collection<UUID> storyIds);

	/** How many people the poster may know about viewed each of these Stories; a Story nobody viewed is left out. */
	@Query("""
			select v.storyId as storyId, count(v) as count from StoryView v join Story s on s.id = v.storyId
			where v.storyId in :storyIds
			  and not exists (select b.id from UserBlock b
			                  where (b.blockerId = s.posterId and b.blockedId = v.viewerId)
			                     or (b.blockerId = v.viewerId and b.blockedId = s.posterId))
			group by v.storyId
			""")
	List<ViewCount> countVisible(Collection<UUID> storyIds);

	/** The views of a Story the poster may know about, newest first. */
	@Query("""
			select v from StoryView v join Story s on s.id = v.storyId
			where v.storyId = :storyId
			  and not exists (select b.id from UserBlock b
			                  where (b.blockerId = s.posterId and b.blockedId = v.viewerId)
			                     or (b.blockerId = v.viewerId and b.blockedId = s.posterId))
			order by v.viewedAt desc, v.id desc
			""")
	List<StoryView> findVisible(UUID storyId);

	interface ViewCount {

		UUID getStoryId();

		long getCount();

	}

}
