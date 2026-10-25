package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.AttachmentResponse;
import dev.salman.backend.dto.PostStoryRequest;
import dev.salman.backend.dto.StoryPoster;
import dev.salman.backend.dto.StoryResponse;
import dev.salman.backend.dto.StoryTray;
import dev.salman.backend.entity.Story;
import dev.salman.backend.entity.StoryKind;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.StoryRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.AttachmentService;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.StoryService;
import dev.salman.backend.service.StoryViewService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class StoryServiceImpl implements StoryService {

	static final int MAX_LIVE = 30;
	static final Duration LIFETIME = Duration.ofHours(24);
	private static final Duration POST_WINDOW = Duration.ofHours(1);
	private static final int SWEEP_BATCH = 100;

	private final StoryRepository stories;
	private final StoryViewService views;
	private final UserRepository users;
	private final StoryAudience audience;
	private final AttachmentLoader attachmentLoader;
	private final AttachmentService attachmentService;
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
		// Locked until this post commits, so a Story and a Message (or two Stories) cannot both claim it.
		var photo = request.kind() == StoryKind.PHOTO ? attachmentService.claim(posterId, request.attachmentId()) : null;
		var story = new Story();
		story.setPosterId(posterId);
		story.setKind(request.kind());
		story.setText(request.text());
		story.setTone(request.tone());
		story.setAttachmentId(request.attachmentId());
		story.setCreatedAt(now);
		story.setExpiresAt(now.plus(LIFETIME));
		stories.save(story);
		var response = StoryResponse.from(story, photo, false, null); // as the audience sees it
		events.storyPosted(response, posterOf(poster));
		return response.forPoster(0);
	}

	@Override
	@Transactional(readOnly = true)
	public StoryTray tray(UUID callerId) {
		var others = audience.of(callerId);
		var posters = new ArrayList<UUID>(others);
		posters.add(callerId);
		var live = stories.findLiveByPosters(posters, clock.instant());
		var photos = attachmentLoader.byId(live.stream().map(Story::getAttachmentId).filter(Objects::nonNull).toList());
		var seen = views.seenAmong(callerId, live.stream().map(Story::getId).toList());
		var counts = views
				.countsOf(live.stream().filter(story -> story.getPosterId().equals(callerId)).map(Story::getId).toList());
		var byPoster = live.stream().collect(Collectors.groupingBy(Story::getPosterId, LinkedHashMap::new,
				Collectors.mapping(story -> {
					var shown = StoryResponse.from(story, photoOf(story, photos), seen.contains(story.getId()), null);
					return story.getPosterId().equals(callerId) ? shown.forPoster(counts.getOrDefault(story.getId(), 0L))
							: shown;
				}, Collectors.toList())));
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

	private static AttachmentResponse photoOf(Story story, Map<UUID, AttachmentResponse> photos) {
		return story.getAttachmentId() == null ? null : photos.get(story.getAttachmentId());
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
		if (story.getAttachmentId() != null) {
			// The Story first (it stops referring to the photo), then the photo: its files go after commit, and a
			// storage failure leaves them to the sweep without undoing the deletion.
			var photo = story.getAttachmentId();
			story.setAttachmentId(null);
			stories.saveAndFlush(story);
			attachmentService.release(photo);
		}
		else {
			stories.save(story);
		}
		events.storyRemoved(story.getId(), callerId);
	}

	@Override
	@Transactional
	public void removeExpired() {
		var expired = stories.findExpiredForSweep(clock.instant(), SWEEP_BATCH);
		if (expired.isEmpty()) {
			return;
		}
		// The rows first (their views go with them), then the photos: their files go after commit.
		stories.deleteAllInBatch(expired);
		for (var story : expired) {
			if (story.getAttachmentId() != null) {
				attachmentService.release(story.getAttachmentId());
			}
			if (story.getDeletedAt() == null) { // a deleted Story was announced when it was deleted
				events.storyRemoved(story.getId(), story.getPosterId());
			}
		}
	}

}
