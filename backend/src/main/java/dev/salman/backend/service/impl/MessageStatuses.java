package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.UUID;

import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;

/**
 * A Message's status for its sender: the lowest delivered and read positions among everyone else in the
 * Conversation, so it is delivered or read only once every one of them has reached it. A Participant who joined
 * later cannot drag it down, because their positions start at their join point. With nobody else left it stays
 * {@code SENT}. Nobody but the sender sees a status.
 */
final class MessageStatuses {

	private MessageStatuses() {
	}

	static MessageStatus of(Message message, UUID viewerId, Collection<Participant> members) {
		if (!message.getSenderId().equals(viewerId)) {
			return null;
		}
		var others = members.stream().filter(p -> !p.getUserId().equals(viewerId)).toList();
		if (others.isEmpty()) {
			return MessageStatus.SENT;
		}
		var delivered = others.stream().mapToLong(Participant::getLastDeliveredSeq).min().orElseThrow();
		var read = others.stream().mapToLong(Participant::getLastReadSeq).min().orElseThrow();
		if (read >= message.getSeq()) {
			return MessageStatus.READ;
		}
		return delivered >= message.getSeq() ? MessageStatus.DELIVERED : MessageStatus.SENT;
	}

}
