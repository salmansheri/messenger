package dev.salman.backend.service.impl;

import java.time.Clock;
import java.time.Duration;
import java.util.HashSet;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import dev.salman.backend.config.AppProperties;
import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.dto.PushJob;
import dev.salman.backend.entity.Conversation;
import dev.salman.backend.entity.ConversationType;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.entity.User;
import dev.salman.backend.lib.AfterCommit;
import dev.salman.backend.lib.Previews;
import dev.salman.backend.lib.NotificationSender;
import dev.salman.backend.lib.PushPublisher;
import dev.salman.backend.lib.PushResult;
import dev.salman.backend.lib.PushUnavailableException;
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

	/** How long we remember that a device was already queued for a Message (longer than any retrying takes). */
	private static final Duration QUEUED_MEMORY = Duration.ofDays(1);

	private final PushPublisher publisher;
	private final NotificationSender sender;
	private final MessageRepository messages;
	private final ConversationRepository conversations;
	private final ParticipantRepository participants;
	private final UserRepository users;
	private final DeviceRepository devices;
	private final PresenceService presence;
	private final StringRedisTemplate redis;
	private final AppProperties props;
	private final Clock clock;

	@Override
	public void messageStored(Message message) {
		AfterCommit.run(() -> publisher.messageStored(message.getId()));
	}

	@Override
	public void fanOut(PushJob job) {
		try {
			queueDeliveries(job.messageId());
		}
		catch (RuntimeException e) {
			log.warn("Could not queue the pushes for a message (attempt {})", job.attempt(), e);
			if (job.attempt() >= props.push().maxAttempts()) {
				publisher.bury(job);
				return;
			}
			try {
				publisher.fanOutLater(job.nextAttempt());
			}
			catch (RuntimeException cannotRetry) {
				publisher.bury(job); // if even this fails the exception leaves the worker and the broker requeues the job
			}
		}
	}

	private void queueDeliveries(UUID messageId) {
		var message = messages.findById(messageId).orElse(null);
		if (message == null) {
			return; // deleted with its conversation in the meantime
		}
		if (message.isDeleted()) {
			return; // taken back before anyone was told: there is nothing left to show
		}
		var recipients = new HashSet<UUID>();
		var now = clock.instant();
		participants.findByConversationId(message.getConversationId()).stream()
				.filter(p -> !p.getUserId().equals(message.getSenderId()))
				.filter(p -> !p.isMuted(now)) // a muted Conversation stays quiet; unread and live events carry on
				.map(Participant::getUserId).forEach(recipients::add);
		recipients.removeAll(presence.onlineAmong(recipients));
		if (recipients.isEmpty()) {
			return;
		}
		var title = titleFor(message);
		var body = Previews.of(message.getBody(), message.getAttachmentId() != null, PREVIEW_CHARACTERS);
		for (var device : devices.findByUserIdIn(recipients)) {
			var key = "push:queued:" + messageId + ":" + device.getId();
			if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key, "1", QUEUED_MEMORY))) {
				continue; // an earlier attempt of this job already queued it
			}
			try {
				publisher.deliver(new PushDelivery(device.getId(), device.getUserId(), device.getToken(), title, body, 1));
			}
			catch (RuntimeException e) {
				redis.delete(key); // not queued after all: the retry must do it
				throw e;
			}
		}
	}

	@Override
	public void deliver(PushDelivery delivery) {
		try {
			if (sender.send(delivery.token(), delivery.title(), delivery.body()) == PushResult.TOKEN_REJECTED) {
				devices.deleteByTokenAndUserId(delivery.token(), delivery.userId());
			}
		}
		catch (PushUnavailableException e) {
			log.warn("The push provider is unavailable (attempt {})", delivery.attempt(), e);
			retryOrBury(delivery);
		}
		catch (RuntimeException e) {
			log.error("Dropped a push after an unexpected error", e);
		}
	}

	private void retryOrBury(PushDelivery delivery) {
		if (delivery.attempt() >= props.push().maxAttempts()) {
			publisher.bury(delivery);
			return;
		}
		try {
			publisher.retryLater(delivery.nextAttempt());
		}
		catch (RuntimeException cannotRetry) {
			publisher.bury(delivery); // if even this fails the exception leaves the worker and the broker requeues it
		}
	}

	/** The sender's name; in a Group also which Group, so a notification says where the Message was sent. */
	private String titleFor(Message message) {
		var senderName = users.findById(message.getSenderId()).map(User::getDisplayName).orElse("New message");
		return conversations.findById(message.getConversationId()).filter(c -> c.getType() == ConversationType.GROUP)
				.map(Conversation::getName).map(group -> senderName + " in " + group).orElse(senderName);
	}

}
