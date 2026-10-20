package dev.salman.backend.service;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import dev.salman.backend.dto.ConversationSettings;
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
 * <li>{@code message.updated}: a Message was edited ({@code message}, with its new text and {@code editedAt}), to
 * every Participant;</li>
 * <li>{@code receipts.updated}: {@code deliveredUpTo} and {@code readUpTo}, the point everyone else has reached,
 * worked out separately for each recipient and sent only to those for whom it moved;</li>
 * <li>{@code unread.updated}: the reporter's own {@code deliveredSeq}, {@code readSeq} and {@code unreadCount}, to
 * the reporter only;</li>
 * <li>{@code settings.changed}: the owner's own mute, archive or pin changed ({@code settings}), to that User's
 * sessions only, so their tabs and devices agree; nobody else ever hears about it;</li>
 * <li>{@code conversation.changed}: the Conversation or who is in it changed; clients should fetch it again;</li>
 * <li>{@code typing.changed}: a Participant started or stopped typing ({@code userId}, {@code typing}); never stored,
 * so clients should treat a "started" as stale after a few seconds without a repeat;</li>
 * <li>{@code presence.changed} (no {@code conversationId}): a User went online or offline ({@code userId},
 * {@code online}, and {@code lastSeenAt} when offline), to everyone who shares a Conversation with them.</li>
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
	 * A Message's text changed or it was deleted for everyone; the pushed copy has no status, like
	 * {@code message.created}. Heard only by current Participants who can read it (joined before it) and have not hidden
	 * it for themselves.
	 */
	void messageUpdated(Message message);

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

	/** The User changed their private settings for a Conversation; heard only by that User's sessions. */
	void settingsChanged(UUID userId, UUID conversationId, ConversationSettings settings);

	/** A Participant started or stopped typing; heard by the other current Participants. */
	void typingChanged(UUID conversationId, UUID typistId, boolean typing);

	/** The User went online or offline; heard by everyone who shares a Conversation with them. */
	void presenceChanged(UUID userId, boolean online, Instant lastSeenAt);

	/** The User's credentials were revoked: every socket they have open, on any instance, is closed. */
	void credentialsRevoked(UUID userId);

}
