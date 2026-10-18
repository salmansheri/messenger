package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.DeviceResponse;
import dev.salman.backend.dto.RegisterDeviceRequest;

/** The devices a User gets push notifications on. */
public interface DeviceService {

	record Registered(DeviceResponse device, boolean created) {
	}

	/**
	 * Registers a device token for the User. Registering a token the User already has changes nothing; a token that
	 * belonged to someone else moves to this User. That is deliberate: the same phone legitimately changes accounts,
	 * and the token is a secret only that phone's app should know.
	 *
	 * @throws dev.salman.backend.exception.ConflictException when the User already has the maximum number of devices
	 */
	Registered register(UUID userId, RegisterDeviceRequest request);

	/** Forgets every device of the User (their password was reset). */
	void unregisterAll(UUID userId);

	/** Forgets one of the User's devices. Unknown ids and other Users' devices are ignored. */
	void unregister(UUID userId, UUID deviceId);

}
