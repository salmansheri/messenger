package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import dev.salman.backend.support.StompTestClient;
import tools.jackson.databind.JsonNode;

/** Stories: posting one (text #69, photo #70), seeing them in the tray, deleting one, Story views (#71), expiry (#72). */
class StoryTests extends RealtimeIntegrationTest {

	private final HttpClient http = HttpClient.newHttpClient();

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account linus;
	private String direct;

	@BeforeEach
	void accounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		linus = client.account("Linus Torvalds");
		direct = idOf(client.startDirect(ada.accessToken(), grace.id()).andExpect(status().isCreated()));
	}

	@Test
	void aPostedTextStoryIsAnsweredAndShownFirstInThePostersOwnTray() throws Exception {
		var posted = client.postTextStory(ada.accessToken(), "Off to the Analytical Engine 🚂", "MOSS")
				.andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.posterId").value(ada.id())).andExpect(jsonPath("$.kind").value("TEXT"))
				.andExpect(jsonPath("$.text").value("Off to the Analytical Engine 🚂"))
				.andExpect(jsonPath("$.tone").value("MOSS"));
		var story = json.readTree(posted.andReturn().getResponse().getContentAsString());
		var createdAt = Instant.parse(story.get("createdAt").asString());
		assertThat(createdAt).isBetween(clock.instant().minusSeconds(10), clock.instant());
		assertThat(Instant.parse(story.get("expiresAt").asString())).isEqualTo(createdAt.plus(Duration.ofHours(24)));
		var id = story.get("id").asString();
		client.postTextStory(ada.accessToken(), "Second", "PLUM").andExpect(status().isCreated());

		client.stories(ada.accessToken()).andExpect(status().isOk()).andExpect(jsonPath("$.own", hasSize(2)))
				.andExpect(jsonPath("$.own[0].id").value(id)).andExpect(jsonPath("$.own[1].text").value("Second"))
				.andExpect(jsonPath("$.people").isEmpty()); // Grace has none, so she is not listed
	}


	@Test
	void theTextFollowsTheTextRulesAndTheToneMustBeOneOfSix() throws Exception {
		client.postTextStory(ada.accessToken(), "   ", "SEA").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must not be blank"));
		client.postTextStory(ada.accessToken(), null, "SEA").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must not be blank"));
		client.postTextStory(ada.accessToken(), "a\u0000b", "SEA").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must not contain NUL characters"));
		client.postTextStory(ada.accessToken(), "😀".repeat(701), "SEA").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must be at most 700 characters"));
		client.postTextStory(ada.accessToken(), "Teal", "TEAL").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.tone").value("must be one of CLAY, OCHRE, MOSS, SEA, SLATE, PLUM"));
		client.postTextStory(ada.accessToken(), "No tone", null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.tone").isNotEmpty());
		client.postStoryBody(ada.accessToken(), Map.of("kind", "VIDEO", "text", "Hi", "tone", "SEA"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.kind").isNotEmpty());
		client.postTextStory("not-a-jwt", "Hi", "SEA").andExpect(status().isUnauthorized());
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own").isEmpty());

		client.postTextStory(ada.accessToken(), "😀".repeat(700), "CLAY").andExpect(status().isCreated());
	}

	@Test
	void theAudienceIsEveryoneSharingADirectConversationAndNotAGroupOnlyAcquaintance() throws Exception {
		client.createGroup(ada.accessToken(), "Team", grace.id(), linus.id()).andExpect(status().isCreated());
		var first = idOf(client.postTextStory(ada.accessToken(), "First", "SEA"));
		var second = idOf(client.postTextStory(ada.accessToken(), "Second", "SEA"));

		client.stories(grace.accessToken()).andExpect(jsonPath("$.own").isEmpty())
				.andExpect(jsonPath("$.people", hasSize(1))).andExpect(jsonPath("$.people[0].userId").value(ada.id()))
				.andExpect(jsonPath("$.people[0].displayName").value("Ada Lovelace"))
				.andExpect(jsonPath("$.people[0].avatarUrl").doesNotExist())
				.andExpect(jsonPath("$.people[0].stories[0].id").value(first))
				.andExpect(jsonPath("$.people[0].stories[1].id").value(second));
		client.stories(linus.accessToken()).andExpect(jsonPath("$.people").isEmpty());
	}

	@Test
	void whoeverPostedMostRecentlyComesFirst() throws Exception {
		client.startDirect(linus.accessToken(), grace.id()).andExpect(status().isCreated());
		client.postTextStory(ada.accessToken(), "Ada early", "SEA").andExpect(status().isCreated());
		client.postTextStory(linus.accessToken(), "Linus", "SEA").andExpect(status().isCreated());
		client.postTextStory(ada.accessToken(), "Ada late", "SEA").andExpect(status().isCreated());

		client.stories(grace.accessToken()).andExpect(jsonPath("$.people[0].userId").value(ada.id()))
				.andExpect(jsonPath("$.people[0].stories", hasSize(2)))
				.andExpect(jsonPath("$.people[1].userId").value(linus.id()));
	}

	@Test
	void aBlockEitherWayTakesBothOutOfEachOthersTrayUntilItIsLifted() throws Exception {
		client.postTextStory(ada.accessToken(), "Ada's", "SEA").andExpect(status().isCreated());
		client.postTextStory(grace.accessToken(), "Grace's", "SEA").andExpect(status().isCreated());

		client.block(grace.accessToken(), ada.id()).andExpect(status().isNoContent());
		client.stories(ada.accessToken()).andExpect(jsonPath("$.people").isEmpty()).andExpect(jsonPath("$.own", hasSize(1)));
		client.stories(grace.accessToken()).andExpect(jsonPath("$.people").isEmpty());

		client.unblock(grace.accessToken(), ada.id()).andExpect(status().isNoContent());
		client.stories(ada.accessToken()).andExpect(jsonPath("$.people[0].userId").value(grace.id()));
		client.stories(grace.accessToken()).andExpect(jsonPath("$.people[0].userId").value(ada.id()));
	}

	@Test
	void anExpiredStoryIsNeverServedEvenBeforeAnythingCleansItUp() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Brief", "SEA"));
		clock.advance(Duration.ofHours(23).plusMinutes(59));
		var adaToken = client.loginForTokens(ada.email(), AuthClient.PASSWORD).accessToken();
		var graceToken = client.loginForTokens(grace.email(), AuthClient.PASSWORD).accessToken();
		client.stories(graceToken).andExpect(jsonPath("$.people", hasSize(1)));

		clock.advance(Duration.ofMinutes(2));
		adaToken = client.loginForTokens(ada.email(), AuthClient.PASSWORD).accessToken();
		graceToken = client.loginForTokens(grace.email(), AuthClient.PASSWORD).accessToken();
		client.stories(graceToken).andExpect(jsonPath("$.people").isEmpty());
		client.stories(adaToken).andExpect(jsonPath("$.own").isEmpty());
		client.deleteStory(adaToken, story).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Story not found."));
	}

	@Test
	void thePosterDeletesTheirOwnStoryOnceAndForAll() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Regret", "SEA"));
		var kept = idOf(client.postTextStory(ada.accessToken(), "Keep", "SEA"));

		client.deleteStory(ada.accessToken(), story).andExpect(status().isNoContent());
		client.deleteStory(ada.accessToken(), story).andExpect(status().isNoContent());

		client.stories(ada.accessToken()).andExpect(jsonPath("$.own", hasSize(1))).andExpect(jsonPath("$.own[0].id").value(kept));
		client.stories(grace.accessToken()).andExpect(jsonPath("$.people[0].stories", hasSize(1)));
	}

	@Test
	void someoneElsesStoryAnUnseeableOneAndAnUnknownIdAreAllNotFound() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Mine", "SEA"));
		for (var attempt : new String[][] { { grace.accessToken(), story }, { linus.accessToken(), story },
				{ ada.accessToken(), UUID.randomUUID().toString() } }) {
			client.deleteStory(attempt[0], attempt[1]).andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("Story not found."));
		}
		client.stories(grace.accessToken()).andExpect(jsonPath("$.people[0].stories", hasSize(1)));
	}

	@Test
	void theThirtyFirstLiveStoryIsRefused() throws Exception {
		for (var n = 1; n <= 30; n++) {
			client.postTextStory(ada.accessToken(), "Story " + n, "SEA").andExpect(status().isCreated());
		}

		client.postTextStory(ada.accessToken(), "One too many", "SEA").andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("You can have at most 30 live Stories."));
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own", hasSize(30)));
	}

	@Test
	void posting31TimesInAnHourIsThrottledEvenWhenDeletingMadeRoom() throws Exception {
		String last = null;
		for (var n = 1; n <= 30; n++) {
			last = idOf(client.postTextStory(ada.accessToken(), "Story " + n, "SEA").andExpect(status().isCreated()));
		}
		client.deleteStory(ada.accessToken(), last).andExpect(status().isNoContent());

		client.postTextStory(ada.accessToken(), "Again", "SEA").andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own", hasSize(29)));
		client.postTextStory(grace.accessToken(), "Grace is fine", "SEA").andExpect(status().isCreated());
	}

	@Test
	void postingAndDeletingReachThePostersSessionsAndAudienceButNobodyElse() throws Exception {
		client.createGroup(ada.accessToken(), "Team", grace.id(), linus.id()).andExpect(status().isCreated());
		var otherTabOfAda = listening(ada);
		var forGrace = listening(grace);
		var forLinus = listening(linus);

		var story = idOf(client.postTextStory(ada.accessToken(), "Live", "OCHRE"));

		var posted = forGrace.await(e -> isStory(e, "story.posted"));
		assertThat(posted.get("story").get("id").asString()).isEqualTo(story);
		assertThat(posted.get("story").get("text").asString()).isEqualTo("Live");
		assertThat(posted.get("poster").get("userId").asString()).isEqualTo(ada.id());
		assertThat(posted.get("poster").get("displayName").asString()).isEqualTo("Ada Lovelace");
		assertThat(posted.get("story").get("seen").asBoolean()).isFalse();
		assertThat(posted.get("story").has("viewCount")).isFalse();
		var ownPosted = otherTabOfAda.await(e -> isStory(e, "story.posted"));
		assertThat(ownPosted.get("story").get("seen").asBoolean()).isTrue(); // her own, with its count
		assertThat(ownPosted.get("story").get("viewCount").asLong()).isZero();

		client.deleteStory(ada.accessToken(), story).andExpect(status().isNoContent());
		client.deleteStory(ada.accessToken(), story).andExpect(status().isNoContent());

		var removed = forGrace.await(e -> isStory(e, "story.removed"));
		assertThat(removed.get("storyId").asString()).isEqualTo(story);
		assertThat(removed.get("posterId").asString()).isEqualTo(ada.id());
		otherTabOfAda.await(e -> isStory(e, "story.removed"));
		assertThat(forLinus.receivesNothingMatching(e -> e.path("type").asString().startsWith("story."), 800)).isTrue();
		// The second delete changed nothing, so it said nothing.
		assertThat(forGrace.receivesNothingMatching(e -> isStory(e, "story.removed"), 800)).isTrue();
		assertThat(forGrace.history()).filteredOn(e -> isStory(e, "story.removed")).hasSize(1);
	}

	@Test
	void noStoryEventCrossesABlockEitherWay() throws Exception {
		client.block(ada.accessToken(), grace.id()).andExpect(status().isNoContent());
		var forAda = listening(ada);
		var forGrace = listening(grace);

		var adas = idOf(client.postTextStory(ada.accessToken(), "Ada's", "SEA"));
		var graces = idOf(client.postTextStory(grace.accessToken(), "Grace's", "SEA"));
		client.deleteStory(ada.accessToken(), adas).andExpect(status().isNoContent());
		client.deleteStory(grace.accessToken(), graces).andExpect(status().isNoContent());

		// Each hears their own removal last; the other's events would have arrived by then.
		forAda.await(e -> isStory(e, "story.removed") && e.get("posterId").asString().equals(ada.id()));
		forGrace.await(e -> isStory(e, "story.removed") && e.get("posterId").asString().equals(grace.id()));
		assertThat(forAda.history()).noneMatch(e -> grace.id().equals(posterOf(e)));
		assertThat(forGrace.history()).noneMatch(e -> ada.id().equals(posterOf(e)));
	}

	/** What fetching a signed link answers now. */
	private int statusOf(String url) throws Exception {
		var link = URI.create(url);
		var local = URI.create("http://localhost:" + port + link.getRawPath() + "?" + link.getRawQuery());
		return http.send(HttpRequest.newBuilder(local).build(),
				HttpResponse.BodyHandlers.discarding()).statusCode();
	}

	/** The stored file behind a signed link: links lapse with the clock, so removal is seen on the disk. */
	private static Path fileOf(String url) {
		return Path.of("target/test-uploads")
				.resolve(URI.create(url).getPath().substring("/api/v1/files/".length()));
	}

	/** Uploads an image as {@code account} and answers its id. */
	private String upload(Account account) throws Exception {
		return idOf(client.uploadImage(account.accessToken(), "a.png", "image/png", UploadImageTests.image("png", 40, 30))
				.andExpect(status().isCreated()));
	}

	private ResultActions postPhotoStory(Account account, String attachmentId,
			String caption) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		body.put("kind", "PHOTO");
		body.put("attachmentId", attachmentId);
		if (caption != null) {
			body.put("text", caption);
		}
		return client.postStoryBody(account.accessToken(), body);
	}

	@Test
	void aPhotoStoryCarriesItsUploadWithFreshlySignedLinksAndAnOptionalCaption() throws Exception {
		var photo = upload(ada);
		var posted = postPhotoStory(ada, photo, "At Bletchley").andExpect(status().isCreated())
				.andExpect(jsonPath("$.kind").value("PHOTO")).andExpect(jsonPath("$.text").value("At Bletchley"))
				.andExpect(jsonPath("$.tone").doesNotExist()).andExpect(jsonPath("$.attachment.id").value(photo))
				.andExpect(jsonPath("$.attachment.width").value(40)).andExpect(jsonPath("$.attachment.height").value(30))
				.andExpect(jsonPath("$.attachment.url").isNotEmpty())
				.andExpect(jsonPath("$.attachment.thumbnailUrl").isNotEmpty());
		var story = idOf(posted);
		postPhotoStory(ada, upload(ada), null).andExpect(status().isCreated())
				.andExpect(jsonPath("$.text").doesNotExist());

		var tray = json.readTree(client.stories(grace.accessToken()).andExpect(status().isOk()).andReturn()
				.getResponse().getContentAsString());
		var shown = tray.get("people").get(0).get("stories").get(0);
		assertThat(shown.get("id").asString()).isEqualTo(story);
		assertThat(shown.get("attachment").get("id").asString()).isEqualTo(photo);
		assertThat(statusOf(shown.get("attachment").get("url").asString())).isEqualTo(200);
		assertThat(statusOf(shown.get("attachment").get("thumbnailUrl").asString())).isEqualTo(200);
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own[0].attachment.id").value(photo));
	}

	@Test
	void anUploadThatIsNotThePostersOwnOrIsAlreadyUsedIsNotFound() throws Exception {
		var gracesUpload = upload(grace);
		var sentWithAMessage = upload(ada);
		client.sendBody(ada.accessToken(), direct,
				Map.of("clientMessageId", UUID.randomUUID(), "attachmentId", sentWithAMessage))
				.andExpect(status().isCreated());
		var deletedWithItsMessage = upload(ada);
		var deleted = idOf(client.sendBody(ada.accessToken(), direct,
				Map.of("clientMessageId", UUID.randomUUID(), "attachmentId", deletedWithItsMessage)));
		client.deleteMessage(ada.accessToken(), direct, deleted).andExpect(status().isNoContent());
		var inAnotherStory = upload(ada);
		postPhotoStory(ada, inAnotherStory, null).andExpect(status().isCreated());

		for (var attachment : new String[] { gracesUpload, sentWithAMessage, deletedWithItsMessage, inAnotherStory,
				UUID.randomUUID().toString() }) {
			postPhotoStory(ada, attachment, "Mine?").andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("Attachment not found."));
		}
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own", hasSize(1)));
	}

	@Test
	void aStorysPhotoCannotAlsoBeSentWithAMessage() throws Exception {
		var photo = upload(ada);
		postPhotoStory(ada, photo, null).andExpect(status().isCreated());

		client.sendBody(ada.accessToken(), direct, Map.of("clientMessageId", UUID.randomUUID(), "attachmentId", photo))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Attachment not found."));
	}

	@Test
	void aPhotoStoryNeedsAnUploadAndNoToneAndItsCaptionFollowsTheTextRules() throws Exception {
		var photo = upload(ada);
		client.postStoryBody(ada.accessToken(), Map.of("kind", "PHOTO", "text", "No photo"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.attachmentId").value("must not be null"));
		client.postStoryBody(ada.accessToken(), Map.of("kind", "PHOTO", "attachmentId", photo, "tone", "SEA"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.tone").value("must be left out for a photo Story"));
		postPhotoStory(ada, photo, "  ").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must not be blank"));
		postPhotoStory(ada, photo, "a\u0000b").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must not contain NUL characters"));
		postPhotoStory(ada, photo, "😀".repeat(701)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.text").value("must be at most 700 characters"));
		client.postStoryBody(ada.accessToken(), Map.of("kind", "TEXT", "text", "Hi", "tone", "SEA", "attachmentId", photo))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.attachmentId").value("must be left out for a text Story"));
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own").isEmpty());

		postPhotoStory(ada, photo, "😀".repeat(700)).andExpect(status().isCreated());
	}

	@Test
	void aLiveStorysPhotoOutlivesTheLifetimeOfAnUnsentUpload() throws Exception {
		var upload = json.readTree(client.uploadImage(ada.accessToken(), "a.png", "image/png",
				UploadImageTests.image("png", 40, 30)).andExpect(status().isCreated()).andReturn().getResponse()
				.getContentAsString());
		var image = fileOf(upload.get("url").asString());
		var thumbnail = fileOf(upload.get("thumbnailUrl").asString());
		var unsent = fileOf(json.readTree(client.uploadImage(ada.accessToken(), "b.png", "image/png",
				UploadImageTests.image("png", 10, 10)).andExpect(status().isCreated()).andReturn().getResponse()
				.getContentAsString()).get("url").asString());
		clock.advance(Duration.ofHours(23));
		var adaToken = client.loginForTokens(ada.email(), AuthClient.PASSWORD).accessToken();
		client.postStoryBody(adaToken, Map.of("kind", "PHOTO", "attachmentId", upload.get("id").asString()))
				.andExpect(status().isCreated());

		clock.advance(Duration.ofHours(2)); // both uploads are a day old; the Story has 22 hours to go
		await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(unsent).doesNotExist()); // a sweep ran

		assertThat(image).exists();
		assertThat(thumbnail).exists();
		var graceToken = client.loginForTokens(grace.email(), AuthClient.PASSWORD).accessToken();
		var shown = json.readTree(client.stories(graceToken).andReturn().getResponse().getContentAsString())
				.get("people").get(0).get("stories").get(0).get("attachment");
		assertThat(statusOf(shown.get("url").asString())).isEqualTo(200);
	}

	@Test
	void deletingAPhotoStoryRemovesItsFilesAndTheUploadCannotBeUsedAgain() throws Exception {
		var posted = json.readTree(postPhotoStory(ada, upload(ada), "Gone soon").andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString());
		var image = fileOf(posted.get("attachment").get("url").asString());
		var thumbnail = fileOf(posted.get("attachment").get("thumbnailUrl").asString());
		assertThat(image).exists();

		client.deleteStory(ada.accessToken(), posted.get("id").asString()).andExpect(status().isNoContent());

		await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
			assertThat(image).doesNotExist();
			assertThat(thumbnail).doesNotExist();
		});
		postPhotoStory(ada, posted.get("attachment").get("id").asString(), null).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Attachment not found."));
	}

	@Test
	void aStorageFailureStillDeletesThePhotoStoryAndTheFilesGoOnceStorageRecovers() throws Exception {
		var posted = json.readTree(postPhotoStory(ada, upload(ada), null).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString());
		var story = posted.get("id").asString();
		var image = fileOf(posted.get("attachment").get("url").asString());
		storage.failDeletes();

		client.deleteStory(ada.accessToken(), story).andExpect(status().isNoContent());
		client.deleteStory(ada.accessToken(), story).andExpect(status().isNoContent()); // still a 204 with storage down

		client.stories(ada.accessToken()).andExpect(jsonPath("$.own").isEmpty());
		client.stories(grace.accessToken()).andExpect(jsonPath("$.people").isEmpty());
		assertThat(image).as("storage could not delete it yet").exists();

		storage.reset();
		await().atMost(Duration.ofSeconds(15))
				.untilAsserted(() -> assertThat(image).doesNotExist());
	}

	@Test
	void aTextStoryHasNoAttachment() throws Exception {
		client.postTextStory(ada.accessToken(), "Words only", "SEA").andExpect(status().isCreated())
				.andExpect(jsonPath("$.attachment").doesNotExist());
	}

	@Test
	void aViewIsRecordedOnceAndTheTrayShowsWhoHasSeenWhatAndThePosterTheCount() throws Exception {
		client.startDirect(linus.accessToken(), ada.id()).andExpect(status().isCreated());
		var first = idOf(client.postTextStory(ada.accessToken(), "First", "SEA"));
		idOf(client.postTextStory(ada.accessToken(), "Second", "SEA"));
		client.stories(grace.accessToken()).andExpect(jsonPath("$.people[0].stories[0].seen").value(false))
				.andExpect(jsonPath("$.people[0].stories[0].viewCount").doesNotExist());
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own[0].viewCount").value(0));

		client.viewStory(grace.accessToken(), first).andExpect(status().isNoContent());
		client.viewStory(grace.accessToken(), first).andExpect(status().isNoContent());
		client.viewStory(linus.accessToken(), first).andExpect(status().isNoContent());
		client.viewStory(ada.accessToken(), first).andExpect(status().isNoContent()); // her own: records nothing

		client.stories(grace.accessToken()).andExpect(jsonPath("$.people[0].stories[0].seen").value(true))
				.andExpect(jsonPath("$.people[0].stories[1].seen").value(false))
				.andExpect(jsonPath("$.people[0].stories[0].viewCount").doesNotExist());
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own[0].viewCount").value(2))
				.andExpect(jsonPath("$.own[1].viewCount").value(0));
	}

	@Test
	void viewingAStoryOneCannotSeeOrThatIsGoneIsNotFound() throws Exception {
		var story = idOf(client.postTextStory(ada.accessToken(), "Mine", "SEA"));
		var deleted = idOf(client.postTextStory(ada.accessToken(), "Deleted", "SEA"));
		client.deleteStory(ada.accessToken(), deleted).andExpect(status().isNoContent());

		for (var attempt : new String[][] { { linus.accessToken(), story }, { grace.accessToken(), deleted },
				{ grace.accessToken(), UUID.randomUUID().toString() } }) {
			client.viewStory(attempt[0], attempt[1]).andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("Story not found."));
		}
		client.block(grace.accessToken(), ada.id()).andExpect(status().isNoContent());
		client.viewStory(grace.accessToken(), story).andExpect(status().isNotFound());
		client.unblock(grace.accessToken(), ada.id()).andExpect(status().isNoContent());

		clock.advance(Duration.ofHours(24).plusMinutes(1));
		var graceToken = client.loginForTokens(grace.email(), AuthClient.PASSWORD).accessToken();
		var adaToken = client.loginForTokens(ada.email(), AuthClient.PASSWORD).accessToken();
		client.viewStory(graceToken, story).andExpect(status().isNotFound());
		client.viewStory(adaToken, story).andExpect(status().isNotFound());
	}

	@Test
	void thePosterSeesWhoViewedNewestFirstAndNobodyElseCan() throws Exception {
		client.startDirect(linus.accessToken(), ada.id()).andExpect(status().isCreated());
		var story = idOf(client.postTextStory(ada.accessToken(), "Who saw?", "SEA"));
		client.storyViews(ada.accessToken(), story).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());

		client.viewStory(grace.accessToken(), story).andExpect(status().isNoContent());
		var graceViewedAt = clock.instant();
		clock.advance(Duration.ofMinutes(1));
		client.viewStory(linus.accessToken(), story).andExpect(status().isNoContent());
		clock.advance(Duration.ofMinutes(1));
		client.viewStory(grace.accessToken(), story).andExpect(status().isNoContent()); // keeps her first view

		var viewers = json.readTree(client.storyViews(ada.accessToken(), story).andExpect(status().isOk())
				.andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[0].userId").value(linus.id()))
				.andExpect(jsonPath("$[0].displayName").value("Linus Torvalds"))
				.andExpect(jsonPath("$[0].avatarUrl").doesNotExist()).andExpect(jsonPath("$[1].userId").value(grace.id()))
				.andReturn().getResponse().getContentAsString());
		assertThat(Instant.parse(viewers.get(1).get("viewedAt").asString())).isBetween(graceViewedAt.minusSeconds(10),
				graceViewedAt);

		for (var attempt : new String[][] { { grace.accessToken(), story }, { linus.accessToken(), story },
				{ ada.accessToken(), UUID.randomUUID().toString() } }) {
			client.storyViews(attempt[0], attempt[1]).andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("Story not found."));
		}
		clock.advance(Duration.ofHours(24));
		var adaToken = client.loginForTokens(ada.email(), AuthClient.PASSWORD).accessToken();
		client.storyViews(adaToken, story).andExpect(status().isNotFound());
	}

	@Test
	void aBlockEitherWayHidesTheViewFromTheListAndTheCountUntilItIsLifted() throws Exception {
		client.startDirect(linus.accessToken(), ada.id()).andExpect(status().isCreated());
		var story = idOf(client.postTextStory(ada.accessToken(), "Seen", "SEA"));
		client.viewStory(grace.accessToken(), story).andExpect(status().isNoContent());
		client.viewStory(linus.accessToken(), story).andExpect(status().isNoContent());

		client.block(grace.accessToken(), ada.id()).andExpect(status().isNoContent()); // Grace blocks the poster
		client.block(ada.accessToken(), linus.id()).andExpect(status().isNoContent()); // the poster blocks Linus
		client.storyViews(ada.accessToken(), story).andExpect(jsonPath("$").isEmpty());
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own[0].viewCount").value(0));

		var margaret = client.account("Margaret Hamilton");
		client.startDirect(margaret.accessToken(), ada.id()).andExpect(status().isCreated());
		var forAda = listening(ada);
		clock.advance(Duration.ofMinutes(1)); // her view is the newest
		client.viewStory(margaret.accessToken(), story).andExpect(status().isNoContent());
		var viewed = forAda.await(e -> isStory(e, "story.viewed"));
		assertThat(viewed.get("viewCount").asLong()).as("the hidden views are not counted").isEqualTo(1);

		client.unblock(grace.accessToken(), ada.id()).andExpect(status().isNoContent());
		client.storyViews(ada.accessToken(), story).andExpect(jsonPath("$", hasSize(2)))
				.andExpect(jsonPath("$[0].userId").value(margaret.id())).andExpect(jsonPath("$[1].userId").value(grace.id()));
		client.stories(ada.accessToken()).andExpect(jsonPath("$.own[0].viewCount").value(2));
	}

	@Test
	void aFirstViewTellsOnlyThePostersSessionsWithTheNewCount() throws Exception {
		client.startDirect(linus.accessToken(), ada.id()).andExpect(status().isCreated());
		var story = idOf(client.postTextStory(ada.accessToken(), "Count me", "SEA"));
		var forAda = listening(ada);
		var forGrace = listening(grace);

		client.viewStory(grace.accessToken(), story).andExpect(status().isNoContent());
		var first = forAda.await(e -> isStory(e, "story.viewed"));
		assertThat(first.get("storyId").asString()).isEqualTo(story);
		assertThat(first.get("viewerId").asString()).isEqualTo(grace.id());
		assertThat(first.get("viewCount").asLong()).isEqualTo(1);
		assertThat(Instant.parse(first.get("viewedAt").asString())).isBetween(clock.instant().minusSeconds(10),
				clock.instant());

		client.viewStory(grace.accessToken(), story).andExpect(status().isNoContent()); // a repeat says nothing
		client.viewStory(ada.accessToken(), story).andExpect(status().isNoContent()); // nor does her own look
		client.viewStory(linus.accessToken(), story).andExpect(status().isNoContent());
		var second = forAda.await(e -> isStory(e, "story.viewed") && e.get("viewerId").asString().equals(linus.id()));
		assertThat(second.get("viewCount").asLong()).isEqualTo(2);

		assertThat(forAda.history()).filteredOn(e -> isStory(e, "story.viewed")).hasSize(2);
		assertThat(forGrace.receivesNothingMatching(e -> isStory(e, "story.viewed"), 800)).isTrue();
	}

	@Test
	void theSweepRemovesExpiredStoriesWithTheirPhotosAndTellsEveryoneWhoCouldSeeThem() throws Exception {
		var photoStory = json.readTree(postPhotoStory(ada, upload(ada), "Fleeting").andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString());
		var image = fileOf(photoStory.get("attachment").get("url").asString());
		var thumbnail = fileOf(photoStory.get("attachment").get("thumbnailUrl").asString());
		var textStory = idOf(client.postTextStory(ada.accessToken(), "Also fleeting", "SEA"));
		var deletedEarlier = idOf(client.postTextStory(ada.accessToken(), "Regret", "SEA"));
		client.viewStory(grace.accessToken(), textStory).andExpect(status().isNoContent());
		client.deleteStory(ada.accessToken(), deletedEarlier).andExpect(status().isNoContent());
		clock.advance(Duration.ofHours(23).plusMinutes(59)); // not expired yet
		var otherTabOfAda = listening(signedInAgain(ada));
		var forGrace = listening(signedInAgain(grace));
		var forLinus = listening(signedInAgain(linus));

		clock.advance(Duration.ofMinutes(2));

		await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
			assertThat(image).doesNotExist();
			assertThat(thumbnail).doesNotExist();
		});
		for (var story : new String[] { photoStory.get("id").asString(), textStory }) {
			var removed = awaitRemoval(forGrace, story);
			assertThat(removed.get("posterId").asString()).isEqualTo(ada.id());
			otherTabOfAda.await(e -> isStory(e, "story.removed") && e.get("storyId").asString().equals(story));
		}
		assertThat(forGrace.receivesNothingMatching(
				e -> isStory(e, "story.removed") && e.get("storyId").asString().equals(deletedEarlier), 800)).isTrue();
		assertThat(forLinus.history()).noneMatch(e -> isStory(e, "story.removed"));
	}

	@Test
	void aSweptPhotoStorysFilesGoOnceStorageRecovers() throws Exception {
		var posted = json.readTree(postPhotoStory(ada, upload(ada), null).andExpect(status().isCreated()).andReturn()
				.getResponse().getContentAsString());
		var story = posted.get("id").asString();
		var image = fileOf(posted.get("attachment").get("url").asString());
		clock.advance(Duration.ofHours(23).plusMinutes(59)); // not expired yet
		var forGrace = listening(signedInAgain(grace));
		storage.failDeletes();

		clock.advance(Duration.ofMinutes(2));

		awaitRemoval(forGrace, story); // swept
		assertThat(image).as("storage could not delete it yet").exists();
		storage.reset();
		await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(image).doesNotExist());
	}

	/**
	 * The account with a token issued now. A socket is closed once its token runs out, so a test that moves the clock
	 * past an expiry opens its sockets with fresh tokens just before, or the events would never reach them.
	 */
	private Account signedInAgain(Account account) throws Exception {
		return new Account(account.email(), account.id(),
				client.loginForTokens(account.email(), AuthClient.PASSWORD).accessToken());
	}

	/**
	 * The {@code story.removed} of a swept Story. Moving the clock expires every Story earlier tests left behind too, and
	 * the sweep takes them oldest first in batches, so this one can come after the client's usual five seconds.
	 */
	private static JsonNode awaitRemoval(StompTestClient listener, String story) {
		return await().atMost(Duration.ofSeconds(20)).until(() -> listener.history().stream()
				.filter(e -> isStory(e, "story.removed") && e.get("storyId").asString().equals(story)).findFirst()
				.orElse(null), java.util.Objects::nonNull);
	}

	/** Who posted the Story a story event is about, or null for any other event. */
	private static String posterOf(JsonNode event) {
		return switch (event.path("type").asString()) {
			case "story.posted" -> event.get("poster").get("userId").asString();
			case "story.removed" -> event.get("posterId").asString();
			default -> null;
		};
	}

	private static boolean isStory(JsonNode event, String type) {
		return type.equals(event.path("type").asString());
	}

}
