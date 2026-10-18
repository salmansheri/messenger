package dev.salman.backend.service;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import dev.salman.backend.dto.ReceiptPositions;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.entity.Message;

/**
 * Tells connected clients what just changed. Who hears about it is decided here, from the Conversation's CURRENT
 * Participants, at the moment of the change, so someone who was removed or left never receives later events. Events
 * go out only after the surrounding transaction commits (or at once when there is none).
 *
 * <p>Event types, each a JSON object with {@code type} and {@code conversationId}:
 * <ul>
 * <li>{@code message.created}: a new Message ({@code message}), to every Participant;</li>
 * <li>{@code receipts.updated}: {@code deliveredUpTo} and {@code readUpTo}, the point everyone else has reached,
 * worked out separately for each recipient and sent only to those for whom it moved;</li>
 * <li>{@code unread.updated}: the reporter's own {@code deliveredSeq}, {@code readSeq} and {@code unreadCount}, to
 * the reporter only;</li>
 * <li>{@code conversation.changed}: the Conversation or who is in it changed; clients should fetch it again.</li>
 * </ul>
 *
 * <p>Delivery is best effort and not durable (an instance restarting misses events), and events can arrive in a
 * different order than they happened. Clients therefore order Messages by {@code seq}, treat
 * {@code receipts.updated} values as only ever increasing, and fetch the Conversation list and catch up with
 * {@code afterSeq} after any reconnect.
 */
public interface RealtimeEvents {

	void messageCreated(Message message);

	/**
	 * The reporter's positions moved from {@code before} to {@code after}. Everyone whose view of how far the others
	 * have got changed hears about it, and the reporter hears their own new positions.
	 */
	void receiptsChanged(UUID conversationId, UUID reporterId, ReceiptPositions before, ReceiptResponse after);

	/** The Conversation was created or changed; {@code alsoNotify} are people who just stopped being in it. */
	void conversationChanged(UUID conversationId, Collection<UUID> alsoNotify);

	default void conversationChanged(UUID conversationId) {
		conversationChanged(conversationId, List.of());
	}

	/** The User's credentials were revoked: every socket they have open, on any instance, is closed. */
	void credentialsRevoked(UUID userId);

}
