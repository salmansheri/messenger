package dev.salman.backend.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.LookupRequest;
import dev.salman.backend.dto.UpdateProfileRequest;
import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.dto.UserSummary;
import dev.salman.backend.service.AvatarService;
import dev.salman.backend.lib.Principals;
import java.io.IOException;
import dev.salman.backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

	private final UserService users;
	private final AvatarService avatars;

	@GetMapping("/me")
	UserProfile me(@AuthenticationPrincipal Jwt jwt) {
		return users.profile(Principals.userId(jwt));
	}

	/** Changes the caller's display name; see {@link UserService#updateDisplayName}. */
	@PatchMapping("/me")
	UserProfile updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfileRequest request) {
		return users.updateDisplayName(Principals.userId(jwt), request.displayName());
	}

	/** Sets the caller's avatar from a PNG, JPEG, WebP or GIF (up to 10 MB); see {@link AvatarService#set}. */
	@PutMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	UserProfile setAvatar(@AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file) throws IOException {
		return avatars.set(Principals.userId(jwt), file.getBytes());
	}

	/** Removes the caller's avatar; 204 whether or not they had one. */
	@DeleteMapping("/me/avatar")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeAvatar(@AuthenticationPrincipal Jwt jwt) {
		avatars.remove(Principals.userId(jwt));
	}

	/**
	 * Exact email only: this is how a User finds someone to talk to, not a way to browse the user base. It is a
	 * POST so the address travels in the body and stays out of URLs and access logs.
	 */
	@PostMapping("/lookup")
	UserSummary lookup(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LookupRequest request) {
		return users.findVerifiedByEmail(Principals.userId(jwt), request.email());
	}

}
