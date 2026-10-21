package dev.salman.backend.dto;

import java.util.UUID;

/** An uploaded image: its size lets a client reserve space, the URLs are signed and lapse (see ADR 0005). */
public record AttachmentResponse(UUID id, int width, int height, String url, String thumbnailUrl) {
}
