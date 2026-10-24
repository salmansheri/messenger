package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.PostStoryRequest;
import dev.salman.backend.dto.StoryPoster;
import dev.salman.backend.dto.StoryResponse;
import dev.salman.backend.dto.StoryTray;
import dev.salman.backend.entity.Story;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.StoryRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.StoryService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class StoryServiceImpl implements StoryService {

	static final int MAX_LIVE = 30;
	static final Duration LIFETIME = Duration.ofHours(24);
	private static final Duration POST_WINDOW = Duration.ofHours(1);

	private final StoryRepository stories;
	private final UserRepository users;
	private final StoryAudience audience;
	private final AvatarLinks avatars;
	private final RateLimiter rateLimiter;
	private final RealtimeEvents events;
	private final AppProperties props;
	private final Clock clock;

	@Override
	@Transactional
	public StoryResponse post(UUID posterId, PostStoryRequest request) {
		// Locked, so two posts at once cannot both slip under the cap on live Stories.
		var poster = users.findByIdForUpdate(posterId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		var now = clock.instant();
		if (stories.countLive(posterId, now) >= MAX_LIVE) {
			throw new ConflictException("You can have at most " + MAX_LIVE + " live Stories.");
		}
		rateLimiter.hit("rl:stories:" + posterId, props.stories().maxPostsPerHour(), POST_WINDOW);
		var story = new Story();
		story.setPosterId(posterId);
		story.setKind(request.kind());
		story.setText(request.text());
		story.setTone(request.tone());
		story.setCreatedAt(now);
		story.setExpiresAt(now.plus(LIFETIME));
		stories.save(story);
		var response = StoryResponse.from(story);
		events.storyPosted(response, posterOf(poster));
		return response;
	}

	@Override
	@Transactional(readOnly = true)
	public StoryTray tray(UUID callerId) {
		var others = audience.of(callerId);
		var posters = new ArrayList<UUID>(others);
		posters.add(callerId);
		var byPoster = stories.findLiveByPosters(posters, clock.instant()).stream()
				.collect(Collectors.groupingBy(Story::getPosterId, LinkedHashMap::new,
						Collectors.mapping(StoryResponse::from, Collectors.toList())));
		var own = byPoster.getOrDefault(callerId, List.of());
		byPoster.remove(callerId);
		var usersById = users.findAllById(byPoster.keySet()).stream()
				.collect(Collectors.toMap(User::getId, Function.identity()));
		var people = byPoster.entrySet().stream()
				.sorted(Comparator.comparing(StoryServiceImpl::latestPostedAt).reversed()) // most recent poster first
				.map(e -> {
					var poster = posterOf(usersById.get(e.getKey()));
					return new StoryTray.Person(poster.userId(), poster.displayName(), poster.avatarUrl(), e.getValue());
				}).toList();
		return new StoryTray(own, people);
	}

	/** When a person's latest live Story was posted (their Stories are oldest first). */
	private static Instant latestPostedAt(Map.Entry<UUID, List<StoryResponse>> stories) {
		return stories.getValue().getLast().createdAt();
	}

	private StoryPoster posterOf(User user) {
		return new StoryPoster(user.getId(), user.getDisplayName(), avatars.urlOf(user.getAvatarKey()));
	}

	@Override
	@Transactional
	public void delete(UUID callerId, UUID storyId) {
		// Locked, so two deletes at once announce it only once.
		var story = stories.findByIdForUpdate(storyId).filter(s -> s.getPosterId().equals(callerId))
				.filter(s -> s.getExpiresAt().isAfter(clock.instant()))
				.orElseThrow(() -> new NotFoundException("Story not found."));
		if (story.getDeletedAt() != null) {
			return; // already deleted: nothing more to do or to say
		}
		story.setDeletedAt(clock.instant());
		stories.save(story);
		events.storyRemoved(story.getId(), callerId);
	}

}
