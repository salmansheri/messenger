package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.Reaction;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.lib.Reactions;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.MessageHiddenRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.ReactionRepository;
import dev.salman.backend.service.BlockService;
import dev.salman.backend.service.MessageThrottle;
import dev.salman.backend.service.ReactionService;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ReactionServiceImpl implements ReactionService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final MessageHiddenRepository hidden;
	private final ReactionRepository reactions;
	private final ReactionLoader reactionLoader;
	private final AttachmentLoader attachmentLoader;
	private final QuoteResolver quotes;
	private final RealtimeEvents events;
	private final BlockService blocks;
	private final MessageThrottle throttle;
	private final Clock clock;

	@Override
	@Transactional
	public MessageResponse set(UUID callerId, UUID conversationId, UUID messageId, String emoji) {
		var canonical = Reactions.canonical(emoji)
				.orElseThrow(() -> new BadRequestException("That is not one of the available reactions."));
		return change(callerId, conversationId, messageId, canonical);
	}

	@Override
	@Transactional
	public MessageResponse remove(UUID callerId, UUID conversationId, UUID messageId) {
		return change(callerId, conversationId, messageId, null);
	}

	/** {@code emoji} is the reaction to have afterwards, or null for none. */
	private MessageResponse change(UUID callerId, UUID conversationId, UUID messageId, String emoji) {
		if (participants.findJoinedAfterSeq(conversationId, callerId).isEmpty()) {
			throw notFound();
		}
		throttle.change(callerId); // before the lock, like the other changes
		var conversation = conversations.findByIdForUpdate(conversationId).orElseThrow(ReactionServiceImpl::notFound);
		// Again, under the lock: a removal may have just committed, and the reaction must not outlive it.
		var viewer = participants.findByConversationIdAndUserId(conversationId, callerId).orElseThrow(ReactionServiceImpl::notFound);
		var message = messages.findByIdAndConversationId(messageId, conversationId)
				.filter(candidate -> viewer.canRead(candidate.getSeq()))
				.filter(candidate -> !candidate.isWithheldFrom(callerId))
				.filter(candidate -> hidden.findHiddenAmong(callerId, List.of(candidate.getId())).isEmpty())
				.orElseThrow(() -> new NotFoundException("Message not found."));
		if (emoji != null) {
			// Taking a reaction back is like deleting one's own Message: allowed even while blocking.
			blocks.requireMayChange(callerId, conversation);
		}
		if (message.isDeleted()) {
			throw new ConflictException("You cannot react to a deleted Message.");
		}

		var now = clock.instant();
		var existing = reactions.findByMessageIdAndUserId(messageId, callerId);
		boolean changed;
		if (emoji == null) {
			changed = existing.isPresent();
			existing.ifPresent(reactions::delete);
		}
		else if (existing.isPresent()) {
			changed = !existing.get().getEmoji().equals(emoji);
			if (changed) {
				existing.get().setEmoji(emoji);
				existing.get().setCreatedAt(now);
			}
		}
		else {
			var reaction = new Reaction();
			reaction.setMessageId(messageId);
			reaction.setConversationId(conversationId);
			reaction.setUserId(callerId);
			reaction.setEmoji(emoji);
			reaction.setCreatedAt(now);
			reactions.save(reaction);
			changed = true;
		}
		reactions.flush();
		if (changed) {
			events.reactionChanged(message, callerId, emoji, now);
		}
		return respond(message, callerId, viewer);
	}

	private MessageResponse respond(Message message, UUID callerId, Participant viewer) {
		// A status is only the sender's own view, so the Participants are only read when the caller sent the Message.
		var status = message.getSenderId().equals(callerId)
				? MessageStatuses.of(message, callerId, participants.findByConversationId(message.getConversationId())) : null;
		return MessageResponse.from(message, status, quotes.resolve(List.of(message), conversation -> viewer).get(message.getId()),
				reactionLoader.of(List.of(message), callerId).getOrDefault(message.getId(), List.of()),
				attachmentLoader.of(List.of(message)).get(message.getId()));
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
