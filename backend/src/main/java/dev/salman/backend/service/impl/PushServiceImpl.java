package dev.salman.backend.service.impl;

import java.util.HashSet;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.ConversationType;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.User;
import dev.salman.backend.lib.NotificationSender;
import dev.salman.backend.lib.PushPublisher;
import dev.salman.backend.lib.PushResult;
import dev.salman.backend.repository.ConversationRepository;
import dev.salman.backend.repository.DeviceRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserRepository;
import dev.salman.backend.service.PresenceService;
import dev.salman.backend.service.PushService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class PushServiceImpl implements PushService {

	/** A notification shows a preview, not the whole Message. */
	private static final int PREVIEW_CHARACTERS = 100;

	private final PushPublisher publisher;
	private final NotificationSender sender;
	private final MessageRepository messages;
	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final UserRepository users;
	private final DeviceRepository devices;
	private final PresenceService presence;
	private final AppProperties props;

	@Override
	public void messageStored(Message message) {
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCommit() {
					publisher.messageStored(message.getId());
				}
			});
		}
		else {
			publisher.messageStored(message.getId());
		}
	}

	@Override
	public void fanOut(UUID messageId) {
		var message = messages.findById(messageId).orElse(null);
		if (message == null) {
			return; // deleted with its conversation in the meantime
		}
		var recipients = new HashSet<UUID>();
		participants.findByConversationId(message.getConversationId()).stream().map(Participant::getUserId)
				.filter(id -> !id.equals(message.getSenderId())).forEach(recipients::add);
		recipients.removeAll(presence.onlineAmong(recipients));
		if (recipients.isEmpty()) {
			return;
		}
		var targets = devices.findByUserIdIn(recipients);
		if (targets.isEmpty()) {
			return;
		}
		var title = titleFor(message);
		var body = preview(message.getBody());
		targets.forEach(device -> publisher.deliver(new PushDelivery(device.getToken(), title, body, 1)));
	}

	@Override
	public void deliver(PushDelivery delivery) {
		try {
			if (sender.send(delivery.token(), delivery.title(), delivery.body()) == PushResult.TOKEN_REJECTED) {
				devices.deleteByToken(delivery.token());
			}
		}
		catch (RuntimeException e) { // a temporary provider failure, or anything unexpected: try again later
			if (delivery.attempt() >= props.push().maxAttempts()) {
				log.warn("Giving up on a push after {} attempts", delivery.attempt(), e);
				return;
			}
			publisher.retryLater(delivery.nextAttempt());
		}
	}

	/** The sender's name; in a Group also which Group, so a notification says where the Message was sent. */
	private String titleFor(Message message) {
		var sender = users.findById(message.getSenderId()).map(User::getDisplayName).orElse("New message");
		return conversations.findById(message.getConversationId()).filter(c -> c.getType() == ConversationType.GROUP)
				.map(Conversation::getName).map(group -> sender + " in " + group).orElse(sender);
	}

	private static String preview(String body) {
		if (body.codePointCount(0, body.length()) <= PREVIEW_CHARACTERS) {
			return body;
		}
		return body.substring(0, body.offsetByCodePoints(0, PREVIEW_CHARACTERS)) + "\u2026";
	}

}
