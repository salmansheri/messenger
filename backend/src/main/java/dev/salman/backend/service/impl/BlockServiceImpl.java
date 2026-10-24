package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.BlockedUser;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.ConversationType;
import dev.salman.backend.entity.User;
import dev.salman.backend.entity.UserBlock;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.UserBlockRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.BlockService;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class BlockServiceImpl implements BlockService {

	private static final Duration CHANGE_WINDOW = Duration.ofHours(1);

	private final UserBlockRepository blocks;
	private final ConversationRepository conversations;
	private final UserRepository users;
	private final AvatarLinks avatars;
	private final RateLimiter rateLimiter;
	private final RealtimeEvents events;
	private final AppProperties props;
	private final Clock clock;

	@Override
	@Transactional
	public void block(UUID callerId, UUID userId) {
		lockDirectConversation(callerId, userId);
		if (blocks.existsByBlockerIdAndBlockedId(callerId, userId)) {
			return;
		}
		countChange(callerId);
		var block = new UserBlock();
		block.setBlockerId(callerId);
		block.setBlockedId(userId);
		block.setCreatedAt(clock.instant());
		blocks.save(block);
		events.blockChanged(callerId, userId, true);
	}

	@Override
	@Transactional
	public void unblock(UUID callerId, UUID userId) {
		lockDirectConversation(callerId, userId);
		var existing = blocks.findByBlockerIdAndBlockedId(callerId, userId);
		if (existing.isEmpty()) {
			return;
		}
		countChange(callerId);
		blocks.delete(existing.get());
		events.blockChanged(callerId, userId, false);
	}

	@Override
	@Transactional(readOnly = true)
	public List<BlockedUser> blockedBy(UUID callerId) {
		var found = blocks.findByBlockerIdOrderByCreatedAtDescIdDesc(callerId);
		var usersById = users.findAllById(found.stream().map(UserBlock::getBlockedId).toList()).stream()
				.collect(Collectors.toMap(User::getId, Function.identity()));
		return found.stream().filter(b -> usersById.containsKey(b.getBlockedId())).map(b -> {
			var user = usersById.get(b.getBlockedId());
			return new BlockedUser(user.getId(), user.getDisplayName(), avatars.urlOf(user.getAvatarKey()),
					b.getCreatedAt());
		}).toList();
	}

	@Override
	public void requireMaySend(UUID callerId, Conversation conversation) {
		if (blocksTheOtherParticipant(callerId, conversation)) {
			throw new ConflictException("Unblock this person to send Messages.");
		}
	}

	@Override
	public void requireMayChange(UUID callerId, Conversation conversation) {
		if (blocksTheOtherParticipant(callerId, conversation)) {
			throw new ConflictException("Unblock this person to change Messages.");
		}
	}

	@Override
	public UUID withholderOf(UUID senderId, Conversation conversation) {
		return otherParticipant(senderId, conversation)
				.filter(other -> blocks.existsByBlockerIdAndBlockedId(other, senderId)).orElse(null);
	}

	private boolean blocksTheOtherParticipant(UUID callerId, Conversation conversation) {
		return otherParticipant(callerId, conversation)
				.filter(other -> blocks.existsByBlockerIdAndBlockedId(callerId, other)).isPresent();
	}

	/**
	 * The other User of a Direct conversation (none for a Group), read from its key, which holds both ids. Never load
	 * Participants here: {@code send} calls this before {@code advanceReceipts}, and a managed Participant loaded that
	 * early makes the receipt events read stale positions (the pitfall in CLAUDE.md's Replies note).
	 */
	private static Optional<UUID> otherParticipant(UUID userId, Conversation conversation) {
		if (conversation.getType() != ConversationType.DIRECT) {
			return Optional.empty();
		}
		var user = userId.toString();
		return Arrays.stream(conversation.getDirectKey().split(":")).filter(id -> !id.equals(user)).findFirst()
				.map(UUID::fromString);
	}

	/**
	 * The pair's Direct conversation, locked: Blocks are made under the same lock as sends, so a Message is
	 * unambiguously stored before or after a Block. No Direct conversation (or the caller themselves) looks like an
	 * unknown User, so the endpoint cannot be used to find out who has an account.
	 */
	private void lockDirectConversation(UUID callerId, UUID userId) {
		var conversation = callerId.equals(userId) ? null
				: conversations.findByDirectKey(Conversation.directKey(callerId, userId)).orElse(null);
		if (conversation == null) {
			throw new NotFoundException("User not found.");
		}
		conversations.findByIdForUpdate(conversation.getId()).orElseThrow(() -> new NotFoundException("User not found."));
	}

	private void countChange(UUID callerId) {
		rateLimiter.hit("rl:block:" + callerId, props.blocks().maxChangesPerHour(), CHANGE_WINDOW);
	}

}
