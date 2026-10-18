package dev.salman.backend.service.impl;

import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.UserService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

	private final UserRepository users;

	@Override
	public UserProfile profile(UUID userId) {
		return users.findById(userId)
				.map(UserProfile::from)
				.orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
	}

}
