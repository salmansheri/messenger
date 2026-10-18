package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.RealtimeEvent;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.lib.RealtimePublisher;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RealtimeEventsImpl implements RealtimeEvents {

	private final ParticipantRepository participants;
	private final RealtimePublisher publisher;

	@Override
	public void messageCreated(Message message) {
		var members = participants.findByConversationId(message.getConversationId());
		// No status in the pushed copy: it is the sender's own view and changes as receipts arrive.
		publish(userIds(members), event("message.created", message.getConversationId(),
				Map.of("message", MessageResponse.from(message, null))));
	}

	@Override
	public void receiptsChanged(UUID conversationId, UUID reporterId, long deliveredSeq, long readSeq,
			long unreadCount) {
		var members = participants.findByConversationId(conversationId);
		// Each Participant is told how far everyone ELSE has got; recipients with the same answer share one event.
		Map<ReceiptFrontier, Set<UUID>> byFrontier = new LinkedHashMap<>();
		for (var member : members) {
			byFrontier.computeIfAbsent(ReceiptFrontier.of(member.getUserId(), members), f -> new LinkedHashSet<>())
					.add(member.getUserId());
		}
		byFrontier.forEach((frontier, recipients) -> publish(recipients, event("receipts.updated", conversationId,
				Map.of("deliveredUpTo", frontier.deliveredUpTo(), "readUpTo", frontier.readUpTo()))));
		publish(Set.of(reporterId), event("unread.updated", conversationId,
				Map.of("deliveredSeq", deliveredSeq, "readSeq", readSeq, "unreadCount", unreadCount)));
	}

	@Override
	public void conversationChanged(UUID conversationId, Collection<UUID> alsoNotify) {
		var recipients = userIds(participants.findByConversationId(conversationId));
		recipients.addAll(alsoNotify);
		publish(recipients, event("conversation.changed", conversationId, Map.of()));
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
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCommit() {
					publisher.publish(event);
				}
			});
		}
		else {
			publisher.publish(event);
		}
	}

}
