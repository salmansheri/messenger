package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.dto.ConversationSettings;
import dev.salman.backend.dto.MuteDuration;
import dev.salman.backend.dto.UpdateSettingsRequest;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.ConversationSettingsService;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ConversationSettingsServiceImpl implements ConversationSettingsService {

	static final int MAX_PINNED = 3;

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final ConversationAssembler assembler;
	private final RealtimeEvents events;
	private final Clock clock;

	@Override
	@Transactional
	public ConversationResponse update(UUID callerId, UUID conversationId, UpdateSettingsRequest request) {
		if (request.mute() == null && request.archived() == null && request.pinned() == null) {
			throw new BadRequestException("Say what to change: mute, archived or pinned.");
		}
		if (Boolean.TRUE.equals(request.archived()) && Boolean.TRUE.equals(request.pinned())) {
			throw new BadRequestException("A Conversation cannot be archived and pinned at once.");
		}
		// Taken before anything is read and held to the end of the transaction: one User's settings changes run one
		// after another, so two pins cannot both see room for one more, and archive and pin never act on a stale row.
		participants.lockPinsOf("settings:" + callerId);
		var participant = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(() -> new NotFoundException("Conversation not found."));
		var now = clock.instant();
		var before = ConversationSettings.of(participant, now);

		if (request.mute() != null) {
			participant.setMutedForever(request.mute() == MuteDuration.ALWAYS);
			participant.setMutedUntil(request.mute().length() == null ? null : now.plus(request.mute().length()));
		}
		if (request.archived() != null) {
			participant.setArchived(request.archived());
			if (request.archived()) {
				participant.setPinned(false); // archiving puts it away, pin and all
			}
		}
		if (Boolean.TRUE.equals(request.pinned())) {
			if (participant.isArchived()) {
				throw new ConflictException("Unarchive it before pinning.");
			}
			if (!participant.isPinned() && participants.countByUserIdAndPinnedTrue(callerId) >= MAX_PINNED) {
				throw new ConflictException("You can pin at most " + MAX_PINNED + " Conversations.");
			}
			participant.setPinned(true);
		}
		else if (Boolean.FALSE.equals(request.pinned())) {
			participant.setPinned(false);
		}

		var after = ConversationSettings.of(participant, now);
		if (!after.equals(before)) {
			events.settingsChanged(callerId, conversationId, after);
		}
		var conversation = conversations.findById(conversationId)
				.orElseThrow(() -> new NotFoundException("Conversation not found."));
		return assembler.assemble(List.of(conversation), callerId).getFirst();
	}

}
