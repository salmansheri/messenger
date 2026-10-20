package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.ConversationResponse;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.ConversationType;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.ParticipantRole;
import dev.salman.backend.entity.User;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.ForbiddenException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.exception.UnauthorizedException;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.ReactionRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.GroupService;
import dev.salman.backend.service.RateLimiter;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GroupServiceImpl implements GroupService {

	static final int MAX_PARTICIPANTS = 256;

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final ReactionRepository reactions;
	private final UserRepository users;
	private final ConversationAssembler assembler;
	private final RealtimeEvents events;
	private final RateLimiter rateLimiter;
	private final AppProperties props;
	private final Clock clock;

	/** A Group whose row is locked for this transaction, and the caller's membership of it. */
	private record LockedGroup(Conversation conversation, Participant caller) {

		void requireAdmin() {
			if (caller.getRole() != ParticipantRole.ADMIN) {
				throw new ForbiddenException("Only group admins can do that.");
			}
		}

	}

	@Override
	@Transactional
	public ConversationResponse create(UUID callerId, String name, Collection<UUID> userIds) {
		// Before anything else, and counting failures too: creation must not become a way to probe for Users or spam.
		rateLimiter.hit("rl:group-create:" + callerId, props.groups().maxCreatedPerHour(), Duration.ofHours(1));
		var others = new LinkedHashSet<>(userIds);
		others.remove(callerId);
		if (others.isEmpty() || others.size() > MAX_PARTICIPANTS - 1) {
			throw new BadRequestException("A group needs between 1 and " + (MAX_PARTICIPANTS - 1)
					+ " other participants.");
		}
		users.findById(callerId).orElseThrow(() -> new UnauthorizedException("The user no longer exists."));
		var found = users.findAllById(others);
		if (found.size() != others.size() || !found.stream().allMatch(User::isEmailVerified)) {
			throw new NotFoundException("No user found.");
		}

		var now = clock.instant();
		var group = new Conversation();
		group.setType(ConversationType.GROUP);
		group.setName(name.strip());
		group.setCreatedAt(now);
		group.setUpdatedAt(now);
		conversations.save(group);
		addMember(group, callerId, ParticipantRole.ADMIN, 0);
		others.forEach(userId -> addMember(group, userId, ParticipantRole.MEMBER, 0));
		events.conversationChanged(group.getId());
		return assembler.assemble(List.of(group), callerId).getFirst();
	}

	@Override
	@Transactional
	public ConversationResponse rename(UUID callerId, UUID conversationId, String name) {
		var locked = lockGroup(callerId, conversationId);
		locked.requireAdmin();
		locked.conversation().setName(name.strip());
		events.conversationChanged(conversationId);
		return assembler.assemble(List.of(locked.conversation()), callerId).getFirst();
	}

	@Override
	@Transactional
	public ConversationResponse addParticipant(UUID callerId, UUID conversationId, UUID userId) {
		var locked = lockGroup(callerId, conversationId);
		locked.requireAdmin();
		users.findById(userId).filter(User::isEmailVerified).orElseThrow(() -> new NotFoundException("No user found."));
		if (participants.existsByConversationIdAndUserId(conversationId, userId)) {
			throw new ConflictException("That user is already in the group.");
		}
		if (participants.countByConversationId(conversationId) >= MAX_PARTICIPANTS) {
			throw new ConflictException("The group is full.");
		}
		// The new member's join point is the latest Message now, so everything sent so far stays out of their reach.
		addMember(locked.conversation(), userId, ParticipantRole.MEMBER, locked.conversation().getLastSeq());
		events.conversationChanged(conversationId);
		return assembler.assemble(List.of(locked.conversation()), callerId).getFirst();
	}

	@Override
	@Transactional
	public void removeParticipant(UUID callerId, UUID conversationId, UUID userId) {
		var locked = lockGroup(callerId, conversationId);
		locked.requireAdmin();
		if (userId.equals(callerId)) {
			throw new BadRequestException("Use leave to leave a group.");
		}
		var target = participants.findByConversationIdAndUserId(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("No such participant."));
		var hadReacted = reactions.deleteByConversationIdAndUserId(conversationId, userId) > 0; // nobody who is gone is counted
		participants.delete(target);
		events.conversationChanged(conversationId, List.of(userId)); // the removed User hears about it too
		if (hadReacted) {
			events.reactionsCleared(conversationId, userId);
		}
	}

	@Override
	@Transactional
	public void promote(UUID callerId, UUID conversationId, UUID userId) {
		var locked = lockGroup(callerId, conversationId);
		locked.requireAdmin();
		var target = participants.findByConversationIdAndUserId(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("No such participant."));
		target.setRole(ParticipantRole.ADMIN);
		events.conversationChanged(conversationId);
	}

	@Override
	@Transactional
	public void leave(UUID callerId, UUID conversationId) {
		var locked = lockGroup(callerId, conversationId);
		var remaining = participants.findByConversationId(conversationId).stream()
				.filter(p -> !p.getUserId().equals(callerId)).toList();
		if (remaining.isEmpty()) {
			conversations.delete(locked.conversation()); // nobody is left to read it; the database cascades
			events.conversationChanged(conversationId, List.of(callerId));
			return;
		}
		var hadReacted = reactions.deleteByConversationIdAndUserId(conversationId, callerId) > 0;
		participants.delete(locked.caller());
		if (hadReacted) {
			events.reactionsCleared(conversationId, callerId);
		}
		var hasAdmin = remaining.stream().anyMatch(p -> p.getRole() == ParticipantRole.ADMIN);
		if (!hasAdmin) {
			remaining.stream()
					.min(Comparator.comparing(Participant::getJoinedAt).thenComparing(p -> p.getUserId().toString()))
					.orElseThrow().setRole(ParticipantRole.ADMIN);
		}
		events.conversationChanged(conversationId, List.of(callerId)); // the leaver hears about it too
	}

	/**
	 * Locks the Group and returns the caller's membership, read again under the lock so a removal that just
	 * committed is seen. A cheap check first keeps outsiders from queueing for the lock.
	 */
	private LockedGroup lockGroup(UUID callerId, UUID conversationId) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw notFound();
		}
		var conversation = conversations.findByIdForUpdate(conversationId).orElseThrow(GroupServiceImpl::notFound);
		var caller = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(GroupServiceImpl::notFound);
		if (conversation.getType() != ConversationType.GROUP) {
			throw new BadRequestException("This only applies to groups.");
		}
		return new LockedGroup(conversation, caller);
	}

	private void addMember(Conversation group, UUID userId, ParticipantRole role, long joinedAfterSeq) {
		participants.save(Participant.joining(group.getId(), userId, role, clock.instant(), joinedAfterSeq));
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
