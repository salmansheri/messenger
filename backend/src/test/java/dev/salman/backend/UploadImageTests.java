package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class UploadImageTests extends IntegrationTest {

	private final HttpClient http = HttpClient.newHttpClient();

	private AuthClient client;
	private String token;

	@BeforeEach
	void signedIn() throws Exception {
		client = auth();
		token = client.account("Ada Lovelace").accessToken();
	}

	static byte[] image(String format, int width, int height) throws Exception {
		var picture = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		for (var x = 0; x < width; x++) {
			for (var y = 0; y < height; y++) {
				picture.setRGB(x, y, (x * 7 + y * 13) % 255 << 16 | (x * 3) % 255 << 8 | (y * 5) % 255);
			}
		}
		var out = new ByteArrayOutputStream();
		ImageIO.write(picture, format, out);
		return out.toByteArray();
	}

	byte[] fetch(String url) throws Exception {
		var response = http.send(HttpRequest.newBuilder(URI.create(url)).build(),
				HttpResponse.BodyHandlers.ofByteArray());
		assertThat(response.statusCode()).isEqualTo(200);
		return response.body();
	}

	@Test
	void aPngIsStoredWithItsDimensionsAndCanBeFetchedThroughTheSignedUrl() throws Exception {
		var result = client.uploadImage(token, "cat.png", "image/png", image("png", 300, 200))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.width").value(300))
				.andExpect(jsonPath("$.height").value(200))
				.andReturn();

		var body = json.readTree(result.getResponse().getContentAsString());
		var stored = ImageIO.read(new java.io.ByteArrayInputStream(fetch(body.get("url").asString())));
		assertThat(stored.getWidth()).isEqualTo(300);
		assertThat(stored.getHeight()).isEqualTo(200);
	}

	/** A 1x1 lossless WebP. */
	private static final byte[] WEBP = java.util.Base64.getDecoder()
			.decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

	private JsonNode upload(String name, String type, byte[] bytes) throws Exception {
		return json.readTree(client.uploadImage(token, name, type, bytes).andExpect(status().isCreated()).andReturn()
				.getResponse().getContentAsString());
	}

	/** Puts an EXIF block (carrying a GPS marker and the given orientation) right after the JPEG start marker. */
	static byte[] withExif(byte[] jpeg, int orientation) {
		var tiff = new ByteArrayOutputStream();
		tiff.writeBytes(new byte[] { 'M', 'M', 0, 42, 0, 0, 0, 8 });
		tiff.writeBytes(new byte[] { 0, 1 });
		tiff.writeBytes(new byte[] { 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte) orientation, 0, 0 });
		tiff.writeBytes(new byte[] { 0, 0, 0, 0 });
		tiff.writeBytes("GPSLatitude=51.5074N".getBytes());
		var payload = new ByteArrayOutputStream();
		payload.writeBytes(new byte[] { 'E', 'x', 'i', 'f', 0, 0 });
		payload.writeBytes(tiff.toByteArray());
		var length = payload.size() + 2;
		var out = new ByteArrayOutputStream();
		out.write(jpeg[0]);
		out.write(jpeg[1]);
		out.write(0xFF);
		out.write(0xE1);
		out.write(length >> 8);
		out.write(length & 0xFF);
		out.writeBytes(payload.toByteArray());
		out.write(jpeg, 2, jpeg.length - 2);
		return out.toByteArray();
	}

	@Test
	void everyAllowedFormatIsAccepted() throws Exception {
		assertThat(upload("a.jpg", "image/jpeg", image("jpg", 40, 30)).get("width").asInt()).isEqualTo(40);
		assertThat(upload("a.gif", "image/gif", image("gif", 40, 30)).get("height").asInt()).isEqualTo(30);
		assertThat(upload("a.webp", "image/webp", WEBP).get("width").asInt()).isEqualTo(1);
		assertThat(upload("a.png", "image/png", image("png", 40, 30)).get("width").asInt()).isEqualTo(40);
	}

	@Test
	void theFormatIsDecidedByDecodingNotByTheNameOrDeclaredType() throws Exception {
		client.uploadImage(token, "notes.png", "image/png", "just some text".getBytes())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("That file is not a supported image. Use a PNG, JPEG, WebP or GIF."));
		client.uploadImage(token, "scan.png", "image/png", image("bmp", 10, 10)).andExpect(status().isBadRequest());
		assertThat(upload("really-a-png.txt", "text/plain", image("png", 10, 10)).get("width").asInt()).isEqualTo(10);
	}

	@Test
	void anEmptyFileIsRefused() throws Exception {
		client.uploadImage(token, "empty.png", "image/png", new byte[0]).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("The file is empty."));
	}

	@Test
	void aFileOverTenMegabytesIsRefusedWith413() throws Exception {
		client.uploadImage(token, "big.png", "image/png", new byte[10 * 1024 * 1024 + 1])
				.andExpect(status().isContentTooLarge())
				.andExpect(jsonPath("$.detail").value("The image is larger than 10 MB."));
	}

	@Test
	void anImageWiderThanEightThousandPixelsIsRefused() throws Exception {
		client.uploadImage(token, "wide.png", "image/png", image("png", 8001, 1)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("too large in pixels")));
		upload("edge.png", "image/png", image("png", 8000, 1));
	}

	@Test
	void locationAndOtherMetadataAreNotInTheStoredBytes() throws Exception {
		var original = withExif(image("jpg", 60, 40), 1);
		assertThat(new String(original, java.nio.charset.StandardCharsets.ISO_8859_1)).contains("GPSLatitude");

		var body = upload("holiday.jpg", "image/jpeg", original);

		for (var key : new String[] { "url", "thumbnailUrl" }) {
			var stored = new String(fetch(body.get(key).asString()), java.nio.charset.StandardCharsets.ISO_8859_1);
			assertThat(stored).doesNotContain("GPSLatitude").doesNotContain("Exif");
		}
	}

	@Test
	void aPhotoTakenSidewaysIsStoredUpright() throws Exception {
		var body = upload("sideways.jpg", "image/jpeg", withExif(image("jpg", 60, 40), 6));

		assertThat(body.get("width").asInt()).isEqualTo(40);
		assertThat(body.get("height").asInt()).isEqualTo(60);
		var stored = ImageIO.read(new java.io.ByteArrayInputStream(fetch(body.get("url").asString())));
		assertThat(stored.getWidth()).isEqualTo(40);
		assertThat(stored.getHeight()).isEqualTo(60);
	}

	@Test
	void aThumbnailIsMadeAboutFourHundredEightyPixelsWide() throws Exception {
		var body = upload("large.png", "image/png", image("png", 1200, 600));

		var thumbnail = ImageIO.read(new java.io.ByteArrayInputStream(fetch(body.get("thumbnailUrl").asString())));
		assertThat(thumbnail.getWidth()).isEqualTo(480);
		assertThat(thumbnail.getHeight()).isEqualTo(240);
		var small = upload("small.png", "image/png", image("png", 100, 50));
		var same = ImageIO.read(new java.io.ByteArrayInputStream(fetch(small.get("thumbnailUrl").asString())));
		assertThat(same.getWidth()).isEqualTo(100);
	}

	@Test
	void anUploadNeedsASignedInUser() throws Exception {
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/v1/attachments")
				.file(new org.springframework.mock.web.MockMultipartFile("file", "a.png", "image/png", image("png", 5, 5))))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void theTwentyFirstUploadInAMinuteIsRefusedWithRetryAfter() throws Exception {
		var bytes = image("png", 8, 8);
		for (var n = 0; n < 20; n++) {
			client.uploadImage(token, "a.png", "image/png", bytes).andExpect(status().isCreated());
		}
		client.uploadImage(token, "a.png", "image/png", bytes).andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
		// another User has their own allowance
		client.uploadImage(client.account("Grace Hopper").accessToken(), "a.png", "image/png", bytes)
				.andExpect(status().isCreated());
	}

	@Test
	void anUploadNeverSentWithAMessageIsRemovedAfterADayAndItsLinkStopsWorking() throws Exception {
		var body = upload("abandoned.png", "image/png", image("png", 20, 20));
		var url = body.get("url").asString();
		var thumbnailUrl = body.get("thumbnailUrl").asString();
		assertThat(fetch(url)).isNotEmpty();

		clock.advance(java.time.Duration.ofHours(23));
		Thread.sleep(1000);
		assertThat(fetch(url)).isNotEmpty();

		clock.advance(java.time.Duration.ofHours(2));
		org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
			assertThat(statusOf(url)).isEqualTo(404);
			assertThat(statusOf(thumbnailUrl)).isEqualTo(404);
		});
	}

	int statusOf(String url) throws Exception {
		return http.send(HttpRequest.newBuilder(URI.create(url)).build(), HttpResponse.BodyHandlers.discarding())
				.statusCode();
	}

}
