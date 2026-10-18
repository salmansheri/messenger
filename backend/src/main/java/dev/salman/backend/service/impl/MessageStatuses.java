package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.UUID;

import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;

/**
 * A Message's status for its sender, from the {@link ReceiptFrontier} of everyone else. A Participant who joined
 * later cannot drag it down, because their positions start at their join point. Nobody but the sender sees one.
 */
final class MessageStatuses {

	private MessageStatuses() {
	}

	static MessageStatus of(Message message, UUID viewerId, Collection<Participant> members) {
		if (!message.getSenderId().equals(viewerId)) {
			return null;
		}
		return ReceiptFrontier.of(viewerId, members).statusOf(message.getSeq());
	}

}
