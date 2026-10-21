package dev.salman.backend.service.impl;

import org.springframework.stereotype.Component;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.lib.ObjectStorage;
import lombok.RequiredArgsConstructor;

/** Signs a short-lived link to an avatar. Callers decide who may be given one: only people who share a Conversation. */
@Component
@RequiredArgsConstructor
class AvatarLinks {

	private final ObjectStorage storage;
	private final AppProperties props;

	/** The link for an avatar's storage key, or null when the User has none. */
	String urlOf(String avatarKey) {
		return avatarKey == null ? null : storage.signedUrl(avatarKey, props.storage().urlTtl());
	}

}
