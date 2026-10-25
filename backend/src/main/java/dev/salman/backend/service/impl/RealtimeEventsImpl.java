package dev.salman.backend.service.impl;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import dev.salman.backend.dto.ConversationSettings;
import dev.salman.backend.dto.MessageResponse;
import dev.salman.backend.dto.ReactionView;
import dev.salman.backend.dto.RealtimeEvent;
import dev.salman.backend.dto.ReplyQuote;
import dev.salman.backend.dto.ReceiptPositions;
import dev.salman.backend.dto.ReceiptResponse;
import dev.salman.backend.dto.StoryPoster;
import dev.salman.backend.dto.StoryResponse;
import dev.salman.backend.entity.Availability;
import dev.salman.backend.entity.Message;
import dev.salman.backend.entity.Participant;
import dev.salman.backend.lib.AfterCommit;
import dev.salman.backend.lib.RealtimeListener;
import dev.salman.backend.lib.RealtimePublisher;
import dev.salman.backend.repository.MessageHiddenRepository;
import dev.salman.backend.repository.MessageRepository;
import dev.salman.backend.repository.ParticipantRepository;
import dev.salman.backend.repository.UserBlockRepository;
import dev.salman.backend.service.RealtimeEvents;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RealtimeEventsImpl implements RealtimeEvents {

	private final ParticipantRepository participants;
	private final MessageRepository messages;
	private final UserBlockRepository userBlocks;
	private final MessageHiddenRepository hidden;
	private final QuoteResolver quotes;
	private final ReactionLoader reactionLoader;
	private final AttachmentLoader attachmentLoader;
	private final StoryQuotes storyQuotes;
	private final StoryAudience storyAudience;
	private final RealtimePublisher publisher;

	@Override
	public void messageCreated(Message message) {
		publishMessage("message.created", message, participants.findByConversationId(message.getConversationId())
				.stream().filter(m -> !message.isWithheldFrom(m.getUserId())).toList());
	}

	@Override
	public void messageUpdated(Message message) {
		// Only people who can still read it: not someone who joined after it, who hid it for themselves or from whom it
		// is withheld. An edit by a Blocked User does not reach their blocker either; taking a Message back does.
		var silenced = message.isDeleted() ? Set.<UUID>of() : blockersOf(message.getConversationId(), message.getSenderId());
		var members = participants.findByConversationId(message.getConversationId()).stream()
				.filter(m -> m.canRead(message.getSeq())).filter(m -> !message.isWithheldFrom(m.getUserId()))
				.filter(m -> !silenced.contains(m.getUserId())).toList();
		var hiders = Set.copyOf(hidden.findUserIdsWhoHid(message.getId()));
		publishMessage("message.updated", message, members.stream().filter(m -> !hiders.contains(m.getUserId())).toList());
	}

	/** What one audience of a Message event sees of it besides the Message itself. */
	private record View(Optional<ReplyQuote> quote, List<ReactionView> reactions) {
	}

	/**
	 * Tells these Participants about the Message. No status in the pushed copy: it is the sender's own view and changes
	 * as receipts arrive. A reply carries a quote of the Message it answers, which differs by who reads it (someone who
	 * joined after the quoted Message must not get its text), and so do the reactions (a blocker does not see the
	 * Blocked User's), so recipients who see the same share one event.
	 */
	private void publishMessage(String type, Message message, Collection<Participant> recipients) {
		var answered = quotes.quotedBy(message);
		var hid = answered.map(quotes::hiddenBy).orElse(Set.of());
		var reacted = reactionLoader.ofEach(message, userIds(recipients));
		Map<View, Set<UUID>> audiences = new LinkedHashMap<>();
		for (var member : recipients) {
			var quote = answered.map(original -> QuoteResolver.quoteFor(original, member, hid.contains(member.getUserId())));
			audiences.computeIfAbsent(new View(quote, reacted.get(member.getUserId())), q -> new LinkedHashSet<>())
					.add(member.getUserId());
		}
		var picture = attachmentLoader.of(List.of(message)).get(message.getId());
		var storyQuote = storyQuotes.of(List.of(message)).get(message.getId());
		audiences.forEach((view, audience) -> publish(audience, event(type, message.getConversationId(),
				Map.of("message", MessageResponse.from(message, null, view.quote().orElse(null), view.reactions(), picture,
						storyQuote)))));
	}

	@Override
	public void receiptsChanged(UUID conversationId, UUID reporterId, ReceiptPositions before,
			ReceiptResponse after) {
		var members = participants.findByConversationId(conversationId);
		var limits = frontierLimits(conversationId);
		// Each Participant is told how far everyone ELSE has got, but only if the report moved it for them;
		// recipients with the same answer share one event.
		Map<ReceiptFrontier, Set<UUID>> moved = new LinkedHashMap<>();
		for (var member : members) {
			var limit = limits.getOrDefault(member.getUserId(), Long.MAX_VALUE);
			var now = ReceiptFrontier.ofOthers(member.getUserId(), members).atMost(limit);
			var earlier = ReceiptFrontier.ofOthers(member.getUserId(), members, reporterId, before.deliveredSeq(),
					before.readSeq()).atMost(limit);
			if (!now.equals(earlier)) {
				moved.computeIfAbsent(now, f -> new LinkedHashSet<>()).add(member.getUserId());
			}
		}
		moved.forEach((frontier, recipients) -> publish(recipients, event("receipts.updated", conversationId,
				Map.of("deliveredUpTo", frontier.deliveredUpTo(), "readUpTo", frontier.readUpTo()))));
		publish(Set.of(reporterId), event("unread.updated", conversationId, Map.of("deliveredSeq",
				after.deliveredSeq(), "readSeq", after.readSeq(), "unreadCount", after.unreadCount())));
	}

	/**
	 * How far each Participant touched by Withheld Messages may be told the others have got (ADR 0006); everyone else
	 * has no limit. A sender of Withheld Messages stops just before the first of them, or their client would mark it
	 * Delivered or Read and give the Block away. The blocker stops at the latest Message they can see, so the
	 * Blocked User's positions moving onto a Withheld Message (sending one reads up to it) tell them nothing.
	 */
	private Map<UUID, Long> frontierLimits(UUID conversationId) {
		var limits = new HashMap<UUID, Long>();
		for (var first : messages.findFirstWithheldBySender(conversationId)) {
			limits.put(first.getSenderId(), first.getSeq() - 1);
		}
		if (limits.isEmpty()) {
			return limits; // nothing withheld here (always so in a Group): no more queries
		}
		for (var blocker : messages.findWithheldFrom(conversationId)) {
			limits.merge(blocker, messages.findLatestSeqNotWithheldFrom(conversationId, blocker), Math::min);
		}
		return limits;
	}

	@Override
	public void conversationChanged(UUID conversationId, Collection<UUID> alsoNotify) {
		var recipients = userIds(participants.findByConversationId(conversationId));
		recipients.addAll(alsoNotify);
		publish(recipients, event("conversation.changed", conversationId, Map.of()));
	}

	@Override
	public void reactionChanged(Message message, UUID userId, String emoji, Instant at) {
		var readers = participants.findByConversationId(message.getConversationId()).stream()
				.filter(m -> m.canRead(message.getSeq())).filter(m -> !message.isWithheldFrom(m.getUserId()))
				.collect(Collectors.toList());
		var hiders = Set.copyOf(hidden.findUserIdsWhoHid(message.getId()));
		var silenced = blockersOf(message.getConversationId(), userId); // a blocker never sees the Blocked User's reactions
		var details = new LinkedHashMap<String, Object>();
		details.put("messageId", message.getId());
		details.put("seq", message.getSeq());
		details.put("userId", userId);
		details.put("emoji", emoji);
		details.put("at", at);
		publish(userIds(readers.stream().filter(m -> !hiders.contains(m.getUserId()))
				.filter(m -> !silenced.contains(m.getUserId())).toList()),
				event("reaction.changed", message.getConversationId(), details));
	}

	@Override
	public void reactionsCleared(UUID conversationId, UUID userId) {
		publish(userIds(participants.findByConversationId(conversationId)),
				event("reactions.cleared", conversationId, Map.of("userId", userId)));
	}

	@Override
	public void settingsChanged(UUID userId, UUID conversationId, ConversationSettings settings) {
		publish(Set.of(userId), event("settings.changed", conversationId, Map.of("settings", settings)));
	}

	@Override
	public void blockChanged(UUID blockerId, UUID userId, boolean blocked) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "block.changed");
		payload.put("userId", userId);
		payload.put("blocked", blocked);
		publish(Set.of(blockerId), payload);
	}

	@Override
	public void typingChanged(UUID conversationId, UUID typistId, boolean typing) {
		var recipients = userIds(participants.findByConversationId(conversationId));
		recipients.remove(typistId);
		recipients.removeAll(blockersOf(conversationId, typistId));
		publish(recipients, event("typing.changed", conversationId, Map.of("userId", typistId, "typing", typing)));
	}

	@Override
	public void presenceChanged(UUID userId, boolean online, Instant lastSeenAt) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "presence.changed");
		payload.put("userId", userId);
		payload.put("online", online);
		payload.put("lastSeenAt", online ? null : lastSeenAt);
		publish(presenceAudience(userId), payload);
	}

	@Override
	public void profileChanged(UUID userId, String displayName) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "profile.changed");
		payload.put("userId", userId);
		payload.put("displayName", displayName);
		var recipients = new LinkedHashSet<>(participants.findCoParticipantIds(userId));
		recipients.add(userId);
		publish(recipients, payload);
	}

	@Override
	public void avatarChanged(UUID userId, String avatarUrl) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "profile.changed");
		payload.put("userId", userId);
		payload.put("avatarUrl", avatarUrl); // null: removed
		var recipients = new LinkedHashSet<>(participants.findCoParticipantIds(userId));
		recipients.add(userId);
		publish(recipients, payload);
	}

	@Override
	public void availabilityChanged(UUID userId, Availability availability) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "availability.changed");
		payload.put("userId", userId);
		payload.put("availability", availability);
		var recipients = presenceAudience(userId); // seen by whoever sees the presence
		recipients.add(userId);
		publish(recipients, payload);
	}

	/** Everyone who sees the User's presence: who shares a Conversation with them, less a Block either way. */
	private Set<UUID> presenceAudience(UUID userId) {
		var recipients = new LinkedHashSet<>(participants.findCoParticipantIds(userId));
		recipients.removeAll(userBlocks.findBlockedEitherWayWith(userId));
		return recipients;
	}

	@Override
	public void storyPosted(StoryResponse story, StoryPoster poster) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "story.posted");
		payload.put("story", story);
		payload.put("poster", poster);
		publish(storyAudience.of(poster.userId()), payload);
		var own = new LinkedHashMap<>(payload);
		own.put("story", story.forPoster(0)); // their own: seen, and nobody has viewed it yet
		publish(Set.of(poster.userId()), own);
	}

	@Override
	public void storyRemoved(UUID storyId, UUID posterId) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "story.removed");
		payload.put("storyId", storyId);
		payload.put("posterId", posterId);
		publish(storyRecipients(posterId), payload);
	}

	@Override
	public void storyViewed(UUID posterId, UUID storyId, UUID viewerId, Instant viewedAt, long viewCount) {
		var payload = new LinkedHashMap<String, Object>();
		payload.put("type", "story.viewed");
		payload.put("storyId", storyId);
		payload.put("viewerId", viewerId);
		payload.put("viewedAt", viewedAt);
		payload.put("viewCount", viewCount);
		publish(Set.of(posterId), payload);
	}

	/** The Story's audience and the poster's own sessions. */
	private Set<UUID> storyRecipients(UUID posterId) {
		var recipients = storyAudience.of(posterId);
		recipients.add(posterId);
		return recipients;
	}

	@Override
	public void credentialsRevoked(UUID userId) {
		publish(Set.of(userId), Map.of("type", RealtimeListener.AUTH_REVOKED));
	}

	/** Who in this Conversation blocks the User (only ever the other Participant of a Direct conversation). */
	private Set<UUID> blockersOf(UUID conversationId, UUID userId) {
		return Set.copyOf(userBlocks.findBlockersInDirect(conversationId, userId));
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
