package dev.salman.backend.service.impl;

import java.util.Collection;
import java.util.UUID;

import dev.salman.backend.dto.MessageStatus;
import dev.salman.backend.entity.Participant;

/**
 * How far the OTHER Participants of a Conversation have got, from one Participant's point of view: the highest
 * Sequence number that every one of them has received ({@code deliveredUpTo}) and has read ({@code readUpTo}).
 * That is the lowest of their positions, so a Message is delivered or read only once everyone else has reached
 * it. With nobody else left both are 0, so nothing counts as delivered or read.
 */
record ReceiptFrontier(long deliveredUpTo, long readUpTo) {

	static ReceiptFrontier of(UUID viewerId, Collection<Participant> members) {
		long delivered = Long.MAX_VALUE;
		long read = Long.MAX_VALUE;
		var others = false;
		for (var member : members) {
			if (!member.getUserId().equals(viewerId)) {
				others = true;
				delivered = Math.min(delivered, member.getLastDeliveredSeq());
				read = Math.min(read, member.getLastReadSeq());
			}
		}
		return others ? new ReceiptFrontier(delivered, read) : new ReceiptFrontier(0, 0);
	}

	MessageStatus statusOf(long seq) {
		if (readUpTo >= seq) {
			return MessageStatus.READ;
		}
		return deliveredUpTo >= seq ? MessageStatus.DELIVERED : MessageStatus.SENT;
	}

}
