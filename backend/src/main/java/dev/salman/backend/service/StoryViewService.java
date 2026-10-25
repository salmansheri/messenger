package dev.salman.backend.service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import dev.salman.backend.dto.StoryViewer;

/**
 * Story views (GLOSSARY "Story view"): who has seen which Story. Only the poster learns who viewed, and never anyone
 * hidden from them by a Block either way.
 */
public interface StoryViewService {

	/**
	 * Records that the caller viewed a Story they can see; viewing it again, or viewing one's own Story, records nothing.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException for a Story the caller cannot see, an expired or deleted one
	 *         or an unknown id
	 */
	void view(UUID viewerId, UUID storyId);

	/**
	 * Who viewed one of the caller's live Stories, newest first, less anyone hidden from them by a Block either way.
	 *
	 * @throws dev.salman.backend.exception.NotFoundException for anyone else's Story, an expired or deleted one or an
	 *         unknown id
	 */
	List<StoryViewer> viewers(UUID posterId, UUID storyId);

	/** Which of these Stories the viewer has viewed. */
	Set<UUID> seenAmong(UUID viewerId, Collection<UUID> storyIds);

	/**
	 * How many people viewed each of these Stories, as their poster may know (a Block either way hides a viewer); a
	 * Story nobody viewed is left out.
	 */
	Map<UUID, Long> countsOf(Collection<UUID> storyIds);

}
