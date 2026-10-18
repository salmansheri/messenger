package dev.salman.backend.service.impl;

import java.time.Duration;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.RateLimitedException;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import dev.salman.backend.service.TypingService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class TypingServiceImpl implements TypingService {

	private static final int MAX_STARTS = 10;
	private static final int MAX_STOPS = 30; // generous, but a stop fans out to everyone too
	private static final Duration WINDOW = Duration.ofSeconds(10);

	private final ParticipantRepository participants;
	private final RateLimiter rateLimiter;
	private final RealtimeEvents events;

	@Override
	public void typing(UUID callerId, UUID conversationId, boolean typing) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw new NotFoundException("Conversation not found.");
		}
		try {
			rateLimiter.hit("rl:typing" + (typing ? "" : "-stop") + ":" + callerId + ":" + conversationId,
					typing ? MAX_STARTS : MAX_STOPS, WINDOW);
		}
		catch (RateLimitedException tooFast) {
			return; // a flood is simply dropped; clients repeat "typing" every few seconds anyway
		}
		events.typingChanged(conversationId, callerId, typing);
	}

}
