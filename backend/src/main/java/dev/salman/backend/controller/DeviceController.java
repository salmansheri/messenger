package dev.salman.backend.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.salman.backend.dto.DeviceResponse;
import dev.salman.backend.dto.RegisterDeviceRequest;
import dev.salman.backend.lib.Principals;
import dev.salman.backend.service.DeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

	private final DeviceService devices;

	/** 201 for a new registration (or a token moved from another User), 200 when the caller already had it. */
	@PostMapping
	ResponseEntity<DeviceResponse> register(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody RegisterDeviceRequest request) {
		var registered = devices.register(Principals.userId(jwt), request);
		return ResponseEntity.status(registered.created() ? HttpStatus.CREATED : HttpStatus.OK)
				.body(registered.device());
	}

	@DeleteMapping("/{deviceId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void unregister(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deviceId) {
		devices.unregister(Principals.userId(jwt), deviceId);
	}

}
