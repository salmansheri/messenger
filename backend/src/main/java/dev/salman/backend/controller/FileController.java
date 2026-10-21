package dev.salman.backend.controller;

import java.time.Duration;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.lib.ObjectStorage;
import lombok.RequiredArgsConstructor;

/**
 * Serves a stored image to whoever holds a valid signed link. It is public because an {@code <img>} cannot send a
 * bearer token; the signature is the credential (see ADR 0005). A bad, lapsed or unknown link is one uniform 404.
 */
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

	private final ObjectStorage storage;

	@GetMapping("/{*key}")
	ResponseEntity<Resource> file(@PathVariable String key, @RequestParam(required = false) Long expires,
			@RequestParam(required = false) String signature) {
		var objectKey = key.startsWith("/") ? key.substring(1) : key;
		if (expires == null) {
			throw new NotFoundException("File not found.");
		}
		var resource = storage.open(objectKey, expires, signature)
				.orElseThrow(() -> new NotFoundException("File not found."));
		var type = MediaTypeFactory.getMediaType(objectKey).orElse(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM);
		return ResponseEntity.ok().contentType(type)
				.cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePrivate())
				.header("Cross-Origin-Resource-Policy", "cross-origin")
				.header("X-Content-Type-Options", "nosniff")
				.body(resource);
	}

}
