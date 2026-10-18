package dev.salman.backend.dto;

import java.time.Instant;
import java.util.UUID;

import dev.salman.backend.entity.Device;
import dev.salman.backend.entity.DevicePlatform;

/** The token itself is never sent back: the id is what a client keeps to unregister the device. */
public record DeviceResponse(UUID id, DevicePlatform platform, Instant createdAt) {

	public static DeviceResponse from(Device device) {
		return new DeviceResponse(device.getId(), device.getPlatform(), device.getCreatedAt());
	}

}
