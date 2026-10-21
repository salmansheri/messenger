package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.AuthClient.Account;
import dev.salman.backend.support.RealtimeIntegrationTest;
import tools.jackson.databind.JsonNode;

/** Setting and removing an avatar (#46). */
class AvatarTests extends RealtimeIntegrationTest {

	/** A 1x1 lossless WebP. */
	private static final byte[] WEBP = java.util.Base64.getDecoder()
			.decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

	private final HttpClient http = HttpClient.newHttpClient();

	private AuthClient client;
	private Account ada;
	private Account grace;
	private Account stranger;

	@BeforeEach
	void accounts() throws Exception {
		client = auth();
		ada = client.account("Ada Lovelace");
		grace = client.account("Grace Hopper");
		stranger = client.account("Linus Torvalds");
		client.startDirect(ada.accessToken(), grace.id()).andExpect(status().isCreated());
	}

	private static boolean isProfileChange(JsonNode event) {
		return "profile.changed".equals(event.path("type").asString());
	}

	/** Left half red, right half blue. */
	private static byte[] twoColours(int width, int height, String format) throws Exception {
		var picture = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		for (var x = 0; x < width; x++) {
			for (var y = 0; y < height; y++) {
				picture.setRGB(x, y, (x < width / 2 ? Color.RED : Color.BLUE).getRGB());
			}
		}
		var out = new ByteArrayOutputStream();
		ImageIO.write(picture, format, out);
		return out.toByteArray();
	}

	private JsonNode set(Account who, String name, String type, byte[] bytes) throws Exception {
		return json.readTree(client.uploadAvatar(who.accessToken(), name, type, bytes).andExpect(status().isOk())
				.andExpect(jsonPath("$.avatarUrl").isNotEmpty()).andReturn().getResponse().getContentAsString());
	}

	private URI local(String url) {
		var link = URI.create(url);
		return URI.create("http://localhost:" + port + link.getRawPath() + "?" + link.getRawQuery());
	}

	private byte[] fetch(String url) throws Exception {
		var response = http.send(HttpRequest.newBuilder(local(url)).build(), HttpResponse.BodyHandlers.ofByteArray());
		assertThat(response.statusCode()).isEqualTo(200);
		return response.body();
	}

	private int statusOf(String url) throws Exception {
		return http.send(HttpRequest.newBuilder(local(url)).build(), HttpResponse.BodyHandlers.discarding()).statusCode();
	}

	private String avatarOfAdaSeenBy(Account viewer) throws Exception {
		var list = json.readTree(client.conversations(viewer.accessToken()).andReturn().getResponse().getContentAsString());
		for (var participant : list.get(0).get("participants")) {
			if (participant.get("userId").asString().equals(ada.id())) {
				return participant.path("avatarUrl").isNull() || participant.path("avatarUrl").isMissingNode() ? null
						: participant.get("avatarUrl").asString();
			}
		}
		return null;
	}

	// ---- the picture

	@Test
	void aPictureBecomesA256SquareSeenOnTheOwnersProfile() throws Exception {
		var profile = set(ada, "me.png", "image/png", twoColours(300, 200, "png"));

		var stored = ImageIO.read(new ByteArrayInputStream(fetch(profile.get("avatarUrl").asString())));
		assertThat(stored.getWidth()).isEqualTo(256);
		assertThat(stored.getHeight()).isEqualTo(256);
		client.me(ada.accessToken()).andExpect(jsonPath("$.avatarUrl").value(profile.get("avatarUrl").asString()));
	}

	@Test
	void aWideOrTallPictureIsCroppedAroundItsCentre() throws Exception {
		// 400x100: the middle 100x100 holds the colour change, so the square is half red, half blue.
		var wide = ImageIO.read(new ByteArrayInputStream(
				fetch(set(ada, "wide.png", "image/png", twoColours(400, 100, "png")).get("avatarUrl").asString())));

		assertThat(new Color(wide.getRGB(10, 128)).getRed()).isGreaterThan(200);
		assertThat(new Color(wide.getRGB(245, 128)).getBlue()).isGreaterThan(200);
	}

	@Test
	void everyAllowedFormatIsAccepted() throws Exception {
		for (var upload : new Object[][] { { "a.jpg", "image/jpeg", twoColours(80, 60, "jpg") },
				{ "a.gif", "image/gif", twoColours(80, 60, "gif") }, { "a.webp", "image/webp", WEBP },
				{ "a.png", "image/png", twoColours(80, 60, "png") } }) {
			var url = set(ada, (String) upload[0], (String) upload[1], (byte[]) upload[2]).get("avatarUrl").asString();
			var stored = ImageIO.read(new ByteArrayInputStream(fetch(url)));
			assertThat(stored.getWidth()).isEqualTo(256);
		}
	}

	@Test
	void notAnImageAnEmptyFileAndTooBigAFileAreRefusedAndNothingChanges() throws Exception {
		client.uploadAvatar(ada.accessToken(), "x.png", "image/png", "text".getBytes()).andExpect(status().isBadRequest());
		client.uploadAvatar(ada.accessToken(), "x.png", "image/png", new byte[0]).andExpect(status().isBadRequest());
		client.uploadAvatar(ada.accessToken(), "x.png", "image/png", twoColours(8001, 1, "png"))
				.andExpect(status().isBadRequest());
		client.uploadAvatar(ada.accessToken(), "x.png", "image/png", new byte[10 * 1024 * 1024 + 1])
				.andExpect(status().isContentTooLarge());
		client.me(ada.accessToken()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
	}

	@Test
	void locationAndOtherMetadataAreNotInTheStoredBytes() throws Exception {
		var original = UploadImageTests.withExif(UploadImageTests.image("jpg", 90, 60), 1);
		assertThat(new String(original, StandardCharsets.ISO_8859_1)).contains("GPSLatitude");

		var stored = new String(fetch(set(ada, "me.jpg", "image/jpeg", original).get("avatarUrl").asString()),
				StandardCharsets.ISO_8859_1);

		assertThat(stored).doesNotContain("GPSLatitude").doesNotContain("Exif");
	}

	// ---- replacing and removing

	@Test
	void replacingDeletesTheOldFileAndRemovingDeletesTheNewOne() throws Exception {
		var first = set(ada, "one.png", "image/png", twoColours(64, 64, "png")).get("avatarUrl").asString();
		var second = set(ada, "two.png", "image/png", twoColours(64, 64, "png")).get("avatarUrl").asString();

		assertThat(second).isNotEqualTo(first);
		org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
			assertThat(statusOf(first)).isEqualTo(404);
			assertThat(statusOf(second)).isEqualTo(200);
		});

		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());

		org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(statusOf(second)).isEqualTo(404));
		client.me(ada.accessToken()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
	}

	@Test
	void removingTwiceIsA204ThatChangesNothing() throws Exception {
		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());
		set(ada, "me.png", "image/png", twoColours(64, 64, "png"));
		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());
		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());
	}

	@Test
	void aFailureToDeleteTheOldFileNeverBlocksTheChangeAndIsRetriedLater() throws Exception {
		var first = set(ada, "one.png", "image/png", twoColours(64, 64, "png")).get("avatarUrl").asString();
		storage.failDeletes();

		var second = set(ada, "two.png", "image/png", twoColours(64, 64, "png")).get("avatarUrl").asString();

		assertThat(fetch(second)).isNotEmpty();
		assertThat(statusOf(first)).as("storage could not delete it yet").isEqualTo(200);
		storage.reset();
		org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(statusOf(first)).isEqualTo(404));
	}

	// ---- who sees it

	@Test
	void peopleWhoShareAConversationSeeTheAvatarAndStrangersNeverDo() throws Exception {
		var url = set(ada, "me.png", "image/png", twoColours(64, 64, "png")).get("avatarUrl").asString();

		assertThat(avatarOfAdaSeenBy(grace)).isNotNull();
		assertThat(fetch(avatarOfAdaSeenBy(grace))).isEqualTo(fetch(url));
		client.conversations(stranger.accessToken()).andExpect(jsonPath("$.length()").value(0));
		client.lookup(stranger.accessToken(), ada.email()).andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Ada Lovelace")).andExpect(jsonPath("$.avatarUrl").doesNotExist())
				.andExpect(jsonPath("$.email").doesNotExist());
		client.me(grace.accessToken()).andExpect(jsonPath("$.avatarUrl").doesNotExist());

		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());
		assertThat(avatarOfAdaSeenBy(grace)).isNull();
	}

	@Test
	void someoneRemovedFromTheOnlySharedConversationNoLongerGetsTheAvatar() throws Exception {
		var group = idOf(client.createGroup(ada.accessToken(), "Team", stranger.id()));
		set(ada, "me.png", "image/png", twoColours(64, 64, "png"));
		client.removeParticipant(ada.accessToken(), group, stranger.id()).andExpect(status().isNoContent());

		client.conversations(stranger.accessToken()).andExpect(jsonPath("$.length()").value(0));
	}

	// ---- events

	@Test
	void aChangeIsHeardByFellowParticipantsAndTheOwnersOtherSessionsButNotStrangers() throws Exception {
		var forGrace = listening(grace);
		var otherTabOfAda = listening(ada);
		var forStranger = listening(stranger);

		var url = set(ada, "me.png", "image/png", twoColours(64, 64, "png")).get("avatarUrl").asString();

		var heard = forGrace.await(AvatarTests::isProfileChange);
		assertThat(heard.get("userId").asString()).isEqualTo(ada.id());
		assertThat(heard.get("avatarUrl").asString()).isNotBlank();
		assertThat(fetch(heard.get("avatarUrl").asString())).isEqualTo(fetch(url));
		assertThat(otherTabOfAda.await(AvatarTests::isProfileChange).get("userId").asString()).isEqualTo(ada.id());
		assertThat(forStranger.receivesNothingMatching(AvatarTests::isProfileChange, 800)).isTrue();
	}

	@Test
	void removingTellsThemTheAvatarIsGoneAndRemovingAgainSaysNothing() throws Exception {
		set(ada, "me.png", "image/png", twoColours(64, 64, "png"));
		var forGrace = listening(grace);

		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());
		var heard = forGrace.await(AvatarTests::isProfileChange);
		assertThat(heard.has("avatarUrl")).isTrue();
		assertThat(heard.get("avatarUrl").isNull()).isTrue();

		client.removeAvatar(ada.accessToken()).andExpect(status().isNoContent());
		assertThat(forGrace.receivesNothingMatching(AvatarTests::isProfileChange, 800)).isTrue();
	}

	// ---- limits

	@Test
	void theEleventhChangeInAnHourIsRefusedWithRetryAfter() throws Exception {
		var tiny = twoColours(8, 8, "png");
		for (var n = 0; n < 10; n++) {
			client.uploadAvatar(ada.accessToken(), "a.png", "image/png", tiny).andExpect(status().isOk());
		}

		client.uploadAvatar(ada.accessToken(), "a.png", "image/png", tiny).andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		client.uploadAvatar(grace.accessToken(), "a.png", "image/png", tiny).andExpect(status().isOk());
	}

	@Test
	void anAvatarNeedsASignedInUser() throws Exception {
		client.uploadAvatar("not-a-jwt", "a.png", "image/png", twoColours(8, 8, "png")).andExpect(status().isUnauthorized());
		client.removeAvatar("not-a-jwt").andExpect(status().isUnauthorized());
	}

}
