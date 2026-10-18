package dev.salman.backend.service.impl;

import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.salman.backend.dto.UserProfile;
import dev.salman.backend.dto.UserSummary;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.lib.Emails;
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

	@Override
	public UserSummary findVerifiedByEmail(String email) {
		return users.findByEmail(Emails.normalize(email))
				.filter(User::isEmailVerified)
				.map(UserSummary::from)
				.orElseThrow(() -> new NotFoundException("No user found for that email."));
	}

}
