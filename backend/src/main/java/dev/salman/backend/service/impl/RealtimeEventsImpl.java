package dev.salman.backend.service.impl;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.RealtimeEvent;
import dev.salman.backend.dto.ReceiptPositions;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.lib.AfterCommit;
import dev.salman.backend.lib.RealtimeListener;
import dev.salman.backend.lib.RealtimePublisher;
import dev.salman.backend.repository.MessageHiddenRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RealtimeEventsImpl implements RealtimeEvents {

	private final ParticipantRepository participants;
	private final MessageHiddenRepository hidden;
	private final RealtimePublisher publisher;

	@Override
	public void messageCreated(Message message) {
		var members = participants.findByConversationId(message.getConversationId());
		// No status in the pushed copy: it is the sender's own view and changes as receipts arrive.
		publish(userIds(members), event("message.created", message.getConversationId(),
				Map.of("message", MessageResponse.from(message, null))));
	}

	@Override
	public void messageUpdated(Message message) {
		// Only people who can still read it: not someone who joined after it, nor who hid it for themselves.
		var members = participants.findByConversationId(message.getConversationId()).stream()
				.filter(m -> m.canRead(message.getSeq())).toList();
		var recipients = userIds(members);
		recipients.removeAll(hidden.findUserIdsWhoHid(message.getId()));
		publish(recipients, event("message.updated", message.getConversationId(),
				Map.of("message", MessageResponse.from(message, null))));
	}

	@Override
	public void receiptsChanged(UUID conversationId, UUID reporterId, ReceiptPositions before,
			ReceiptResponse after) {
		var members = participants.findByConversationId(conversationId);
		// Each Participant is told how far everyone ELSE has got, but only if the report moved it for them;
		// recipients with the same answer share one event.
		Map<ReceiptFrontier, Set<UUID>> moved = new LinkedHashMap<>();
		for (var member : members) {
			var now = ReceiptFrontier.ofOthers(member.getUserId(), members);
			var earlier = ReceiptFrontier.ofOthers(member.getUserId(), members, reporterId, before.deliveredSeq(),
					before.readSeq());
			if (!now.equals(earlier)) {
				moved.computeIfAbsent(now, f -> new LinkedHashSet<>()).add(member.getUserId());
			}
		}
		moved.forEach((frontier, recipients) -> publish(recipients, event("receipts.updated", conversationId,
				Map.of("deliveredUpTo", frontier.deliveredUpTo(), "readUpTo", frontier.readUpTo()))));
		publish(Set.of(reporterId), event("unread.updated", conversationId, Map.of("deliveredSeq",
				after.deliveredSeq(), "readSeq", after.readSeq(), "unreadCount", after.unreadCount())));
	}

	@Override
	public void conversationChanged(UUID conversationId, Collection<UUID> alsoNotify) {
		var recipients = userIds(participants.findByConversationId(conversationId));
		recipients.addAll(alsoNotify);
		publish(recipients, event("conversation.changed", conversationId, Map.of()));
	}

	@Override
	public void typingChanged(UUID conversationId, UUID typistId, boolean typing) {
		var recipients = userIds(participants.findByConversationId(conversationId));
		recipients.remove(typistId);
		publish(recipients, event("typing.changed", conversationId, Map.of("userId", typistId, "typing", typing)));
	}

	@Override
	public void presenceChanged(UUID userId, boolean online, Instant lastSeenAt) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "presence.changed");
		payload.put("userId", userId);
		payload.put("online", online);
		payload.put("lastSeenAt", online ? null : lastSeenAt);
		publish(new LinkedHashSet<>(participants.findCoParticipantIds(userId)), payload);
	}

	@Override
	public void credentialsRevoked(UUID userId) {
		publish(Set.of(userId), Map.of("type", RealtimeListener.AUTH_REVOKED));
	}

	private static Set<UUID> userIds(Collection<Participant> members) {
		var ids = new LinkedHashSet<UUID>();
		members.forEach(m -> ids.add(m.getUserId()));
		return ids;
	}

	private static Map<String, Object> event(String type, UUID conversationId, Map<String, Object> details) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", type);
		payload.put("conversationId", conversationId);
		payload.putAll(details);
		return payload;
	}

	/** Sent once the transaction has committed, so nobody hears about something that was rolled back. */
	private void publish(Set<UUID> recipients, Map<String, Object> payload) {
		if (recipients.isEmpty()) {
			return;
		}
		var event = new RealtimeEvent(recipients, payload);
		AfterCommit.run(() -> publisher.publish(event));
	}

}
