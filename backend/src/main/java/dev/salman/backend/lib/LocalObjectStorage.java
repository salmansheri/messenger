package dev.salman.backend.lib;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import dev.salman.backend.config.AppProperties;

/**
 * Keeps objects as files under a directory on this machine and hands out HMAC-signed, expiring links to
 * {@code /api/v1/files/{key}}, which the file endpoint resolves through {@link #open}. Several instances can share
 * the directory (a network disk) because the signing secret is configuration, not state. Swapping this for a cloud
 * bucket later only means another {@link ObjectStorage}.
 */
@Component
public class LocalObjectStorage implements ObjectStorage {

	static final String FILES_PATH = "/api/v1/files/";

	private final Path root;
	private final String baseUrl;
	private final byte[] secret;
	private final Clock clock;

	public LocalObjectStorage(AppProperties props, Clock clock) {
		var storage = props.storage();
		this.root = Path.of(storage.directory()).toAbsolutePath().normalize();
		this.baseUrl = storage.publicBaseUrl().replaceAll("/+$", "");
		this.secret = storage.signingSecret().getBytes(StandardCharsets.UTF_8);
		this.clock = clock;
	}

	@Override
	public void put(String key, byte[] bytes) {
		var target = resolve(key).orElseThrow(() -> new IllegalArgumentException("Bad object key: " + key));
		try {
			Files.createDirectories(target.getParent());
			// Written beside the target and moved into place, so a reader never sees half a file.
			var partial = target.resolveSibling(target.getFileName() + "." + UUID.randomUUID() + ".part");
			Files.write(partial, bytes);
			Files.move(partial, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		}
		catch (IOException e) {
			throw new UncheckedIOException("Could not store " + key, e);
		}
	}

	@Override
	public void delete(String key) {
		try {
			var target = resolve(key);
			if (target.isPresent()) {
				Files.deleteIfExists(target.get());
			}
		}
		catch (IOException e) {
			throw new UncheckedIOException("Could not delete " + key, e);
		}
	}

	@Override
	public String signedUrl(String key, Duration ttl) {
		var expires = clock.instant().plus(ttl).getEpochSecond();
		return baseUrl + FILES_PATH + key + "?expires=" + expires + "&signature=" + sign(key, expires);
	}

	@Override
	public Optional<Resource> open(String key, long expiresAtEpochSecond, String signature) {
		if (signature == null || expiresAtEpochSecond < clock.instant().getEpochSecond()) {
			return Optional.empty();
		}
		var expected = sign(key, expiresAtEpochSecond).getBytes(StandardCharsets.UTF_8);
		if (!MessageDigest.isEqual(expected, signature.getBytes(StandardCharsets.UTF_8))) {
			return Optional.empty();
		}
		return resolve(key).filter(Files::isRegularFile).map(FileSystemResource::new);
	}

	/** The file for a key, or empty when the key would leave the storage directory. */
	private Optional<Path> resolve(String key) {
		if (key == null || key.isBlank() || key.contains("\\") || key.contains("\0")) {
			return Optional.empty();
		}
		var path = root.resolve(key).normalize();
		return path.startsWith(root) && !path.equals(root) ? Optional.of(path) : Optional.empty();
	}

	private String sign(String key, long expires) {
		try {
			var mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret, "HmacSHA256"));
			var digest = mac.doFinal((key + "\n" + expires).getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

}
