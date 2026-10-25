package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.StoryViewer;
import dev.salman.backend.entity.Story;
import dev.salman.backend.entity.StoryView;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.StoryRepository;
import dev.salman.backend.repository.StoryViewRepository;
import dev.salman.backend.repository.StoryViewRepository.ViewCount;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.StoryViewService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class StoryViewServiceImpl implements StoryViewService {

	private final StoryRepository stories;
	private final StoryViewRepository views;
	private final UserRepository users;
	private final StoryAudience audience;
	private final AvatarLinks avatars;
	private final RealtimeEvents events;
	private final Clock clock;

	@Override
	@Transactional
	public void view(UUID viewerId, UUID storyId) {
		var now = clock.instant();
		var story = live(storyId)
				.filter(s -> s.getPosterId().equals(viewerId) || audience.of(s.getPosterId()).contains(viewerId))
				.orElseThrow(StoryViewServiceImpl::notFound);
		if (story.getPosterId().equals(viewerId)) {
			return; // a poster's own look is not a view
		}
		// Only a first view is news. The viewer is in the poster's audience, so no Block hides them from the poster.
		if (views.record(storyId, viewerId, now) == 1) {
			var count = countsOf(List.of(storyId)).getOrDefault(storyId, 0L);
			events.storyViewed(story.getPosterId(), storyId, viewerId, now, count);
		}
	}

	@Override
	@Transactional(readOnly = true)
	public List<StoryViewer> viewers(UUID posterId, UUID storyId) {
		live(storyId).filter(s -> s.getPosterId().equals(posterId)).orElseThrow(StoryViewServiceImpl::notFound);
		var shown = views.findVisible(storyId);
		var usersById = users.findAllById(shown.stream().map(StoryView::getViewerId).toList()).stream()
				.collect(Collectors.toMap(User::getId, Function.identity()));
		return shown.stream().map(view -> {
			var viewer = usersById.get(view.getViewerId());
			return new StoryViewer(viewer.getId(), viewer.getDisplayName(), avatars.urlOf(viewer.getAvatarKey()),
					view.getViewedAt());
		}).toList();
	}

	@Override
	@Transactional(readOnly = true)
	public Set<UUID> seenAmong(UUID viewerId, Collection<UUID> storyIds) {
		return storyIds.isEmpty() ? Set.of() : Set.copyOf(views.findSeenAmong(viewerId, storyIds));
	}

	@Override
	@Transactional(readOnly = true)
	public Map<UUID, Long> countsOf(Collection<UUID> storyIds) {
		return storyIds.isEmpty() ? Map.of()
				: views.countVisible(storyIds).stream().collect(Collectors.toMap(ViewCount::getStoryId, ViewCount::getCount));
	}

	/** The Story while it is neither deleted nor expired. */
	private Optional<Story> live(UUID storyId) {
		var now = clock.instant();
		return stories.findById(storyId).filter(s -> s.getDeletedAt() == null && s.getExpiresAt().isAfter(now));
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Story not found.");
	}

}
