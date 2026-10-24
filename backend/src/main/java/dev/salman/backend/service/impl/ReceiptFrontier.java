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

	static ReceiptFrontier ofOthers(UUID viewerId, Collection<Participant> members) {
		return ofOthers(viewerId, members, null, 0, 0);
	}

	/** The same, but with {@code reporterId} shown at the given earlier positions, to see what a report changed. */
	static ReceiptFrontier ofOthers(UUID viewerId, Collection<Participant> members, UUID reporterId,
			long reporterDelivered, long reporterRead) {
		long delivered = Long.MAX_VALUE;
		long read = Long.MAX_VALUE;
		var others = false;
		for (var member : members) {
			if (member.getUserId().equals(viewerId)) {
				continue;
			}
			var reporter = member.getUserId().equals(reporterId);
			others = true;
			delivered = Math.min(delivered, reporter ? reporterDelivered : member.getLastDeliveredSeq());
			read = Math.min(read, reporter ? reporterRead : member.getLastReadSeq());
		}
		return others ? new ReceiptFrontier(delivered, read) : new ReceiptFrontier(0, 0);
	}

	/** The same frontier, but never beyond {@code seq}. */
	ReceiptFrontier atMost(long seq) {
		return new ReceiptFrontier(Math.min(deliveredUpTo, seq), Math.min(readUpTo, seq));
	}

	MessageStatus statusOf(long seq) {
		if (readUpTo >= seq) {
			return MessageStatus.READ;
		}
		return deliveredUpTo >= seq ? MessageStatus.DELIVERED : MessageStatus.SENT;
	}

}
