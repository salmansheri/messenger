package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.AttachmentResponse;
import dev.salman.backend.entity.Attachment;
import dev.salman.backend.entity.Message;
import dev.salman.backend.lib.ObjectStorage;
import dev.salman.backend.repository.AttachmentRepository;
import lombok.RequiredArgsConstructor;

/** Finds the images of a page or list of Messages (or of Stories) in one query and gives each a freshly signed link. */
@Component
@RequiredArgsConstructor
class AttachmentLoader {

	private final AttachmentRepository attachments;
	private final ObjectStorage storage;
	private final AppProperties props;

	/**
	 * The image of each Message by the Message's id. A Message without one, or deleted for everyone, is left out. The
	 * caller has already decided the viewer may read these Messages; a link is a capability for its lifetime (ADR 0005).
	 */
	Map<UUID, AttachmentResponse> of(Collection<Message> shown) {
		var withImage = shown.stream().filter(message -> message.getAttachmentId() != null && !message.isDeleted())
				.toList();
		if (withImage.isEmpty()) {
			return Map.of();
		}
		var byId = attachments.findAllById(withImage.stream().map(Message::getAttachmentId).distinct().toList()).stream()
				.collect(Collectors.toMap(Attachment::getId, a -> a));
		var views = new HashMap<UUID, AttachmentResponse>();
		for (var message : withImage) {
			var attachment = byId.get(message.getAttachmentId());
			if (attachment != null) {
				views.put(message.getId(), view(attachment));
			}
		}
		return views;
	}

	/**
	 * The uploads with these ids by id, each with a freshly signed link; an unknown id is left out. As for Messages, the
	 * caller has already decided the viewer may see them.
	 */
	Map<UUID, AttachmentResponse> byId(Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		return attachments.findAllById(ids.stream().distinct().toList()).stream()
				.collect(Collectors.toMap(Attachment::getId, this::view));
	}

	AttachmentResponse view(Attachment attachment) {
		var ttl = props.storage().urlTtl();
		return new AttachmentResponse(attachment.getId(), attachment.getWidth(), attachment.getHeight(),
				storage.signedUrl(attachment.getStorageKey(), ttl), storage.signedUrl(attachment.getThumbnailKey(), ttl));
	}

}
