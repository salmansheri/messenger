package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.DeviceResponse;
import dev.salman.backend.dto.RegisterDeviceRequest;
import dev.salman.backend.entity.Device;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.repository.DeviceRepository;
import dev.salman.backend.service.DeviceService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class DeviceServiceImpl implements DeviceService {

	private final DeviceRepository devices;
	private final AppProperties props;
	private final Clock clock;

	@Override
	@Transactional
	public Registered register(UUID userId, RegisterDeviceRequest request) {
		devices.lockToken(request.token());
		var existing = devices.findByToken(request.token());
		if (existing.isPresent() && existing.get().getUserId().equals(userId)) {
			return new Registered(DeviceResponse.from(existing.get()), false);
		}
		if (devices.countByUserId(userId) >= props.push().maxDevicesPerUser()) {
			throw new ConflictException("You have registered the maximum number of devices.");
		}
		var device = existing.orElseGet(Device::new);
		device.setUserId(userId);
		device.setToken(request.token());
		device.setPlatform(request.platform());
		device.setCreatedAt(clock.instant());
		return new Registered(DeviceResponse.from(devices.save(device)), true);
	}

	@Override
	public void unregister(UUID userId, UUID deviceId) {
		devices.deleteByIdAndUserId(deviceId, userId);
	}

}
