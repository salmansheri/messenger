package dev.salman.backend.service.impl;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.dto.MessagePage;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.dto.ReceiptPositions;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.dto.SentMessage;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.exception.BadRequestException;
import dev.salman.backend.exception.ConflictException;
import dev.salman.backend.exception.ForbiddenException;
import dev.salman.backend.exception.NotFoundException;
import dev.salman.backend.config.AppProperties;
import dev.salman.backend.repository.AttachmentRepository;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.MessageHiddenRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.AttachmentService;
import dev.salman.backend.service.BlockService;
import dev.salman.backend.service.MessageService;
import dev.salman.backend.service.MessageThrottle;
import dev.salman.backend.service.PushService;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MessageServiceImpl implements MessageService {

	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final MessageHiddenRepository hidden;
	private final QuoteResolver quotes;
	private final AttachmentRepository attachments;
	private final AttachmentLoader attachmentLoader;
	private final AttachmentService attachmentService;
	private final ReactionLoader reactionLoader;
	private final RealtimeEvents events;
	private final PushService push;
	private final MessageThrottle throttle;
	private final AppProperties props;
	private final Clock clock;
	private final BlockService blocks;

	/**
	 * The Conversation row is locked while the Message is stored, so concurrent sends run one after another: the
	 * Sequence number is read and incremented in the same transaction that stores the Message (a failed send leaves
	 * no gap), and a concurrent retry sees the first send's Message instead of racing it.
	 */
	@Override
	@Transactional
	public SentMessage send(UUID callerId, UUID conversationId, UUID clientMessageId, String body,
			UUID replyToMessageId, UUID attachmentId) {
		requireParticipant(callerId, conversationId);
		// Before the lock, so a User over the limit never queues behind (or in front of) other people's sends. A
		// retry the server already stored is answered below without counting; two retries racing here at worst
		// count twice.
		if (messages.findByConversationIdAndSenderIdAndClientMessageId(conversationId, callerId, clientMessageId)
				.isEmpty()) {
			throttle.send(callerId);
		}
		var conversation = conversations.findByIdForUpdate(conversationId).orElseThrow(MessageServiceImpl::notFound);
		// Again, under the lock: a removal may have just committed. Only the join point is read here, not the
		// Participant: see ParticipantRepository.findJoinedAfterSeq.
		var joinedAfter = participants.findJoinedAfterSeq(conversationId, callerId).orElseThrow(MessageServiceImpl::notFound);

		var existing = messages.findByConversationIdAndSenderIdAndClientMessageId(conversationId, callerId,
				clientMessageId);
		if (existing.isPresent()) {
			// Once edited or deleted there is no original text left to compare with: the retry is the same Message.
			var stored = existing.get();
			if ((!stored.isDeleted() && stored.getEditedAt() == null && !Objects.equals(stored.getBody(), body))
					|| (!stored.isDeleted() && !Objects.equals(stored.getAttachmentId(), attachmentId))
					|| !Objects.equals(stored.getReplyToId(), replyToMessageId)) {
				throw new ConflictException("This client message ID was already used for a different message.");
			}
			return new SentMessage(responseFor(stored, statusFor(stored, callerId), viewer(conversationId, callerId)), false);
		}

		// Under the lock, which a Block also takes: a send is either before the Block or refused by it.
		blocks.requireMaySend(callerId, conversation);

		if (replyToMessageId != null) {
			// Only what the replier may read can be answered; anything else looks like it does not exist.
			var answered = messages.findByIdAndConversationId(replyToMessageId, conversationId)
					.filter(candidate -> candidate.getSeq() > joinedAfter)
					.filter(candidate -> hidden.findHiddenAmong(callerId, List.of(candidate.getId())).isEmpty())
					.orElseThrow(() -> new NotFoundException("Message not found."));
			if (answered.isDeleted()) {
				throw new ConflictException("You cannot reply to a deleted Message.");
			}
		}

		if (attachmentId != null) {
			// Locked, so two sends cannot both claim it. Someone else's, an unknown one and one already sent with a
			// Message look the same.
			attachments.findByIdForUpdate(attachmentId).filter(upload -> upload.getOwnerId().equals(callerId))
					.filter(upload -> upload.getRemovedAt() == null)
					.filter(upload -> !messages.existsByAttachmentId(upload.getId()))
					.orElseThrow(() -> new NotFoundException("Attachment not found."));
		}

		var now = clock.instant();
		conversation.setLastSeq(conversation.getLastSeq() + 1);
		conversation.setUpdatedAt(now);
		var message = new Message();
		message.setConversationId(conversationId);
		message.setSeq(conversation.getLastSeq());
		message.setSenderId(callerId);
		message.setClientMessageId(clientMessageId);
		message.setBody(body);
		message.setReplyToId(replyToMessageId);
		message.setAttachmentId(attachmentId);
		message.setCreatedAt(now);
		messages.save(message);
		// Sending shows the sender has seen the conversation up to here, so their own message is never "unread".
		var before = participants.findPositions(conversationId, callerId).orElseThrow(MessageServiceImpl::notFound);
		participants.advanceReceipts(conversationId, callerId, message.getSeq(), message.getSeq());
		events.messageCreated(message);
		push.messageStored(message);
		if (before.getDeliveredSeq() != message.getSeq() || before.getReadSeq() != message.getSeq()) {
			// Replying counts as having read everything up to it: tell whose messages that reached, and this
			// sender's other devices that nothing is unread any more.
			events.receiptsChanged(conversationId, callerId,
					new ReceiptPositions(before.getDeliveredSeq(), before.getReadSeq()),
					new ReceiptResponse(message.getSeq(), message.getSeq(), 0));
		}
		// Nobody can report a position that did not exist before this send, so a new Message is always still SENT.
		return new SentMessage(responseFor(message, MessageStatus.SENT, viewer(conversationId, callerId)), true);
	}

	@Override
	@Transactional
	public MessageResponse edit(UUID callerId, UUID conversationId, UUID messageId, String body) {
		requireParticipant(callerId, conversationId);
		throttle.change(callerId); // before the lock, like sending
		var conversation = conversations.findByIdForUpdate(conversationId).orElseThrow(MessageServiceImpl::notFound);
		var message = ownMessage(callerId, conversationId, messageId);
		blocks.requireMayChange(callerId, conversation);
		if (message.isDeleted()) {
			throw new ConflictException("This Message was deleted.");
		}
		if (clock.instant().isAfter(message.getCreatedAt().plus(props.messages().editWindow()))) {
			throw new ConflictException("A Message can only be edited for "
					+ props.messages().editWindow().toMinutes() + " minutes after it is sent.");
		}
		if (!Objects.equals(message.getBody(), body)) {
			message.setBody(body);
			message.setEditedAt(clock.instant());
			messages.save(message);
			events.messageUpdated(message);
		}
		return responseFor(message, statusFor(message, callerId), viewer(conversationId, callerId));
	}

	/** The caller as a Participant, for working out what they may see of a quote. */
	private Participant viewer(UUID conversationId, UUID callerId) {
		return participants.findByConversationIdAndUserId(conversationId, callerId).orElseThrow(MessageServiceImpl::notFound);
	}

	/** The Message as {@code viewer} sees it, with the quote if it answers another one. */
	private MessageResponse responseFor(Message message, MessageStatus status, Participant viewer) {
		return MessageResponse.from(message, status, quotes.resolve(List.of(message), conversation -> viewer).get(message.getId()),
				reactionLoader.of(List.of(message)).getOrDefault(message.getId(), List.of()),
				attachmentLoader.of(List.of(message)).get(message.getId()));
	}

	@Override
	@Transactional
	public void deleteForEveryone(UUID callerId, UUID conversationId, UUID messageId) {
		requireParticipant(callerId, conversationId);
		throttle.change(callerId);
		conversations.findByIdForUpdate(conversationId).orElseThrow(MessageServiceImpl::notFound);
		var message = ownMessage(callerId, conversationId, messageId);
		if (message.isDeleted()) {
			return;
		}
		var now = clock.instant();
		if (now.isAfter(message.getCreatedAt().plus(props.messages().deleteWindow()))) {
			throw new ConflictException("A Message can only be deleted for everyone for "
					+ props.messages().deleteWindow().toMinutes() + " minutes after it is sent.");
		}
		message.setBody(null);
		message.setDeletedAt(now);
		if (message.getAttachmentId() != null) {
			// The Message first (it stops referring to the image), then the image: its files go after commit.
			var image = message.getAttachmentId();
			message.setAttachmentId(null);
			messages.saveAndFlush(message);
			attachmentService.release(image);
		}
		else {
			messages.save(message);
		}
		events.messageUpdated(message);
	}

	@Override
	@Transactional
	public void hideForCaller(UUID callerId, UUID conversationId, UUID messageId) {
		var member = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(MessageServiceImpl::notFound);
		throttle.change(callerId);
		messages.findByIdAndConversationId(messageId, conversationId).filter(m -> member.canRead(m.getSeq()))
				.orElseThrow(() -> new NotFoundException("Message not found."));
		hidden.hide(callerId, messageId, conversationId, clock.instant());
	}

	/**
	 * The caller's own Message in this Conversation, under the lock. One that is not in the Conversation, or is from
	 * before the caller joined, looks the same as one that does not exist.
	 */
	private Message ownMessage(UUID callerId, UUID conversationId, UUID messageId) {
		var member = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(MessageServiceImpl::notFound); // again, under the lock: a removal may have just committed
		var message = messages.findByIdAndConversationId(messageId, conversationId)
				.filter(m -> member.canRead(m.getSeq()))
				.orElseThrow(() -> new NotFoundException("Message not found."));
		if (!message.getSenderId().equals(callerId)) {
			throw new ForbiddenException("Only the sender can do that.");
		}
		return message;
	}

	@Override
	@Transactional(readOnly = true)
	public MessagePage history(UUID callerId, UUID conversationId, Long beforeSeq, Long afterSeq, Long aroundSeq,
			int limit) {
		var reader = participants.findByConversationIdAndUserId(conversationId, callerId)
				.orElseThrow(MessageServiceImpl::notFound); // first, so outsiders only see a 404
		if (Stream.of(beforeSeq, afterSeq, aroundSeq).filter(Objects::nonNull).count() > 1) {
			throw new BadRequestException("Use only one of beforeSeq, afterSeq and aroundSeq.");
		}
		if (aroundSeq != null) {
			return window(reader, aroundSeq);
		}
		// One extra row tells whether more exist beyond this page. Nothing at or before the join point is visible.
		var fetch = Limit.of(limit + 1);
		List<Message> found;
		if (afterSeq != null) {
			found = messages.findVisibleAfter(conversationId, callerId, reader.readableAfter(afterSeq), fetch);
		}
		else {
			found = new ArrayList<>(beforeSeq != null
					? messages.findVisibleBefore(conversationId, callerId, reader.readableAfter(0), beforeSeq, fetch)
					: messages.findVisibleNewest(conversationId, callerId, reader.readableAfter(0), fetch));
		}
		var hasMore = found.size() > limit;
		var page = new ArrayList<>(hasMore ? found.subList(0, limit) : found);
		if (afterSeq == null) {
			Collections.reverse(page); // fetched newest first, returned oldest first
		}
		return new MessagePage(responses(page, reader), hasMore);
	}

	/**
	 * The window around {@code aroundSeq}: the {@link #WINDOW_SIDE} visible Messages before it, and the visible ones
	 * from it on, one more so the Message itself counts with its {@link #WINDOW_SIDE} after. One extra row each way
	 * tells whether more exist beyond that end. {@code hasMore} is {@code hasOlder}, the direction it means on the
	 * newest page, so a client that pages back from a window reads it the same way.
	 */
	private MessagePage window(Participant reader, long aroundSeq) {
		var conversationId = reader.getConversationId();
		var callerId = reader.getUserId();
		var before = messages.findVisibleBefore(conversationId, callerId, reader.readableAfter(0), aroundSeq,
				Limit.of(WINDOW_SIDE + 1));
		var from = messages.findVisibleAfter(conversationId, callerId, reader.readableAfter(aroundSeq - 1),
				Limit.of(WINDOW_SIDE + 2));
		var hasOlder = before.size() > WINDOW_SIDE;
		var hasNewer = from.size() > WINDOW_SIDE + 1;
		var page = new ArrayList<>(hasOlder ? before.subList(0, WINDOW_SIDE) : before);
		Collections.reverse(page); // fetched newest first, returned oldest first
		page.addAll(hasNewer ? from.subList(0, WINDOW_SIDE + 1) : from);
		return new MessagePage(responses(page, reader), hasOlder, hasOlder, hasNewer);
	}

	/** A page of Messages as the reader sees them: status of their own, quotes, reactions and images, in few queries. */
	private List<MessageResponse> responses(List<Message> page, Participant reader) {
		var conversationId = reader.getConversationId();
		var callerId = reader.getUserId();
		var members = page.stream().anyMatch(m -> m.getSenderId().equals(callerId))
				? participants.findByConversationId(conversationId) : List.<Participant>of();
		var quoted = quotes.resolve(page, conversation -> reader);
		var reacted = reactionLoader.of(page);
		var pictured = attachmentLoader.of(page);
		return page.stream()
				.map(m -> MessageResponse.from(m, MessageStatuses.of(m, callerId, members), quoted.get(m.getId()),
						reacted.getOrDefault(m.getId(), List.of()), pictured.get(m.getId())))
				.toList();
	}

	private MessageStatus statusFor(Message message, UUID callerId) {
		return MessageStatuses.of(message, callerId, participants.findByConversationId(message.getConversationId()));
	}

	/** A non-Participant gets the same answer as for a Conversation that does not exist. */
	private void requireParticipant(UUID callerId, UUID conversationId) {
		if (!participants.existsByConversationIdAndUserId(conversationId, callerId)) {
			throw notFound();
		}
	}

	private static NotFoundException notFound() {
		return new NotFoundException("Conversation not found.");
	}

}
