package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.UUID;

import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;

/**
 * A Message's status for its sender, from the {@link ReceiptFrontier} of everyone else. A Participant who joined
 * later cannot drag it down, because their positions start at their join point. Nobody but the sender sees one. A
 * Withheld Message is Sent for ever, whatever the blocker's positions do, so its ticks never give the Block away.
 */
final class MessageStatuses {

	private MessageStatuses() {
	}

	static MessageStatus of(Message message, UUID viewerId, Collection<Participant> members) {
		if (!message.getSenderId().equals(viewerId)) {
			return null;
		}
		if (message.isWithheld()) {
			return MessageStatus.SENT;
		}
		return ReceiptFrontier.ofOthers(viewerId, members).statusOf(message.getSeq());
	}

}
