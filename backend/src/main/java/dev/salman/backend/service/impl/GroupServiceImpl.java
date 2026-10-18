package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.GroupService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GroupServiceImpl implements GroupService {

	static final int MAX_PARTICIPANTS = 256;

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final UserRepository users;
	private final ConversationAssembler assembler;
	private final Clock clock;

	/** A Group whose row is locked for this transaction, and the caller's membership of it. */
	private record Locked(Conversation conversation, Participant caller) {

		void requireAdmin() {
			if (caller.getRole() != ParticipantRole.ADMIN) {
				throw new ForbiddenException("Only group admins can do that.");
			}
		}

	}

	@Override
	@Transactional
	public ConversationResponse create(UUID callerId, String name, Collection<UUID> userIds) {
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
		return assembler.assemble(List.of(group), callerId).getFirst();
	}

	@Override
	@Transactional
	public ConversationResponse rename(UUID callerId, UUID conversationId, String name) {
		var locked = lockGroup(callerId, conversationId);
		locked.requireAdmin();
		locked.conversation().setName(name.strip());
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
		participants.delete(target);
	}

	@Override
	@Transactional
	public void promote(UUID callerId, UUID conversationId, UUID userId) {
		var locked = lockGroup(callerId, conversationId);
		locked.requireAdmin();
		var target = participants.findByConversationIdAndUserId(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("No such participant."));
		target.setRole(ParticipantRole.ADMIN);
	}

	@Override
	@Transactional
	public void leave(UUID callerId, UUID conversationId) {
		var locked = lockGroup(callerId, conversationId);
		var remaining = participants.findByConversationId(conversationId).stream()
				.filter(p -> !p.getUserId().equals(callerId)).toList();
		if (remaining.isEmpty()) {
			conversations.delete(locked.conversation()); // nobody is left to read it; the database cascades
			return;
		}
		participants.delete(locked.caller());
		var hasAdmin = remaining.stream().anyMatch(p -> p.getRole() == ParticipantRole.ADMIN);
		if (!hasAdmin) {
			remaining.stream()
					.min(Comparator.comparing(Participant::getJoinedAt).thenComparing(p -> p.getUserId().toString()))
					.orElseThrow().setRole(ParticipantRole.ADMIN);
		}
	}

	/**
	 * Locks the Group and returns the caller's membership, read again under the lock so a removal that just
	 * committed is seen. A cheap check first keeps outsiders from queueing for the lock.
	 */
	private Locked lockGroup(UUID callerId, UUID conversationId) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw notFound();
		}
		var conversation = conversations.findByIdForUpdate(conversationId).orElseThrow(GroupServiceImpl::notFound);
		var caller = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(GroupServiceImpl::notFound);
		if (conversation.getType() != ConversationType.GROUP) {
			throw new BadRequestException("This only applies to groups.");
		}
		return new Locked(conversation, caller);
	}

	private void addMember(Conversation group, UUID userId, ParticipantRole role, long joinedAfterSeq) {
		var member = new Participant();
		member.setConversationId(group.getId());
		member.setUserId(userId);
		member.setRole(role);
		member.setJoinedAt(clock.instant());
		member.setJoinedAfterSeq(joinedAfterSeq);
		participants.save(member);
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
