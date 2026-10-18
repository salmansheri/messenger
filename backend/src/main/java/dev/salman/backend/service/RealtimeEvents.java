package dev.salman.backend.service;

import java.util.Collection;
import java.util.UUID;

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
 * worked out separately for each recipient;</li>
 * <li>{@code unread.updated}: the reporter's own {@code deliveredSeq}, {@code readSeq} and {@code unreadCount}, to
 * the reporter only;</li>
 * <li>{@code conversation.changed}: the Conversation or who is in it changed; clients should fetch it again.</li>
 * </ul>
 */
public interface RealtimeEvents {

	void messageCreated(Message message);

	/** The reporter's positions changed to these values. */
	void receiptsChanged(UUID conversationId, UUID reporterId, long deliveredSeq, long readSeq, long unreadCount);

	/** The Conversation was created or changed; {@code alsoNotify} are people who just stopped being in it. */
	void conversationChanged(UUID conversationId, Collection<UUID> alsoNotify);

}
