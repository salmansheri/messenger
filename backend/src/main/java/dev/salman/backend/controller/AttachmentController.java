package dev.salman.backend.controller;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import dev.salman.backend.dto.AttachmentResponse;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.AttachmentService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/attachments")
@RequiredArgsConstructor
public class AttachmentController {

	private final AttachmentService attachments;

	/** Stores an image (PNG, JPEG, WebP or GIF, up to 10 MB) for the caller to send with a Message. */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	AttachmentResponse upload(@AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file)
			throws IOException {
		return attachments.upload(Principals.userId(jwt), file.getBytes());
	}

}
