import type { ConversationResponse, MessageResponse } from "@/lib/api";
import type { ProfileChanges, RealtimeEvent } from "@/lib/realtime/events";
import { applyReaction } from "@/features/messages/reactions";
import { clearReactionsOf, latestSeq, replaceMessage, updateReactions, withMessage, type History } from "@/features/messages/history";
import { mergeVersion } from "@/features/messages/versions";
import { orderConversations, withSettings } from "@/features/conversations/settings";

const seqOf = (message: MessageResponse) => message.seq ?? 0;

/**
 * A Participant or profile with a name or Avatar change put in: only the keys in `changes`, with `avatarUrl: null`
 * taking the picture away. The same object when it already says so.
 */
export function applyProfileChanges<T extends { displayName?: string; avatarUrl?: string }>(target: T, changes: ProfileChanges): T {
  const renamed = changes.displayName !== undefined && target.displayName !== changes.displayName;
  const repictured = changes.avatarUrl !== undefined && (target.avatarUrl ?? null) !== changes.avatarUrl;
  if (!renamed && !repictured) return target;
  const next = { ...target };
  if (renamed) next.displayName = changes.displayName;
  if (repictured) {
    if (changes.avatarUrl === null) delete next.avatarUrl;
    else next.avatarUrl = changes.avatarUrl;
  }
  return next;
}

/**
 * The list with one person's name or Avatar changed wherever they are a Participant (list rows, headers, the names and
 * pictures beside runs of Messages and the Group panel all read them from here). Only the keys in `changes` are
 * touched, and the same list comes back when nothing differs, so a repeat (or an event about someone in none of these
 * Conversations) changes nothing.
 */
export function withProfile(list: ConversationResponse[], userId: string, changes: ProfileChanges): ConversationResponse[] {
  let changed = false;
  const next = list.map((conversation) => {
    const participants = conversation.participants;
    if (!participants) return conversation;
    const updated = participants.map((p) => (p.userId === userId ? applyProfileChanges(p, changes) : p));
    if (updated.every((p, i) => p === participants[i])) return conversation;
    changed = true;
    return { ...conversation, participants: updated };
  });
  return changed ? next : list;
}

/**
 * How an event changes the Conversation list, without touching the old one. Events are best effort: they can arrive
 * twice or late, so a Message that is not newer than the latest one shown changes nothing. When something cannot be
 * worked out from the event alone (an unknown Conversation, a skipped Message, who you are, a Conversation that
 * changed) the answer is to ask the server again: `refetch`.
 */
export function applyToList(
  list: ConversationResponse[],
  event: RealtimeEvent,
  myId: string | undefined,
): { list: ConversationResponse[]; refetch: boolean } {
  if (event.type === "conversation.changed") return { list, refetch: true };
  if (event.type === "profile.changed") return { list: withProfile(list, event.userId, event.changes), refetch: false };
  if (event.type === "message.updated") return applyUpdateToList(list, event);
  if (event.type === "settings.changed") {
    const next = withSettings(list, event.conversationId, event.settings);
    return next ? { list: next, refetch: false } : { list, refetch: true };
  }
  if (event.type !== "message.created") return { list, refetch: false };

  const known = list.find((conversation) => conversation.id === event.conversationId);
  if (!known || !myId) return { list, refetch: true };

  const { message } = event;
  const shown = known.lastMessage?.seq;
  if (shown !== undefined && seqOf(message) <= shown) return { list, refetch: false };

  const mine = message.senderId === myId;
  const updated: ConversationResponse = {
    ...known,
    lastMessage: mine ? { ...message, status: "SENT" } : message,
    // Sending counts as reading everything before it; anything else is one more unread Message.
    unreadCount: mine ? 0 : (known.unreadCount ?? 0) + 1,
    updatedAt: message.createdAt ?? known.updatedAt,
  };
  const skippedAhead = shown !== undefined && seqOf(message) > shown + 1;
  // Most recent first, but not above the pinned ones.
  return { list: orderConversations([updated, ...list.filter((conversation) => conversation !== known)]), refetch: skippedAhead };
}

/**
 * An edit or deletion only matters to the list when it is about the latest line: that line is swapped (keeping the
 * count, the order and the sender's status). One about a newer Message than the line shows means a Message was missed.
 */
function applyUpdateToList(
  list: ConversationResponse[],
  event: Extract<RealtimeEvent, { type: "message.updated" }>,
): { list: ConversationResponse[]; refetch: boolean } {
  const known = list.find((conversation) => conversation.id === event.conversationId);
  const shown = known?.lastMessage;
  if (!known || !shown) return { list, refetch: true };
  const seq = seqOf(event.message);
  if (seq > seqOf(shown)) return { list, refetch: true };
  if (seq < seqOf(shown)) return { list, refetch: false };
  const merged = mergeVersion(shown, event.message);
  if (merged === shown) return { list, refetch: false };
  return { list: list.map((conversation) => (conversation === known ? { ...known, lastMessage: merged } : conversation)), refetch: false };
}

/**
 * How an event changes a Conversation's loaded history. `catchUp` says a Message skipped ahead of what is loaded, so
 * the ones in between should be fetched.
 */
export function applyToHistory(
  history: History | undefined,
  event: RealtimeEvent,
): { history: History | undefined; catchUp: boolean } {
  if (history && event.type === "reaction.changed") {
    return { history: updateReactions(history, event.messageId, (reactions) => applyReaction(reactions, event.userId, event.emoji)), catchUp: false };
  }
  if (history && event.type === "reactions.cleared") return { history: clearReactionsOf(history, event.userId), catchUp: false };
  if (!history || (event.type !== "message.created" && event.type !== "message.updated")) return { history, catchUp: false };
  const have = latestSeq(history);
  const seq = seqOf(event.message);
  if (event.type === "message.updated") {
    const known = history.pages.flatMap((page) => page.messages ?? []).find((message) => message.seq === seq);
    if (known) {
      const merged = mergeVersion(known, event.message);
      return { history: merged === known ? history : replaceMessage(history, merged), catchUp: false };
    }
    // Not loaded: older than anything shown (nothing to do), or newer than the newest (the new Message was missed).
    if (seq < have) return { history, catchUp: false };
    return { history: withMessage(history, event.message), catchUp: have > 0 && seq > have + 1 };
  }
  if (history.pages.some((page) => page.messages?.some((known) => known.seq === seq))) return { history, catchUp: false };
  return { history: withMessage(history, event.message), catchUp: have > 0 && seq > have + 1 };
}

/**
 * The person's own unread count after a report (from this tab or another). Reports can arrive late or out of order,
 * and a Message may have arrived since the server counted, so: a report older than one already applied is ignored,
 * and the count is never lower than the Messages after the read position that the list already shows. Returns the
 * highest read position seen so far, for the next report to be compared with.
 */
export function applyUnread(
  list: ConversationResponse[],
  knownReadSeq: number | undefined,
  report: { conversationId: string; readSeq: number; unreadCount: number },
): { list: ConversationResponse[]; readSeq: number } {
  const known = knownReadSeq ?? 0;
  if (report.readSeq < known) return { list, readSeq: known };
  const readSeq = report.readSeq;
  if (!list.some((conversation) => conversation.id === report.conversationId)) return { list, readSeq };
  return {
    readSeq,
    list: list.map((conversation) => {
      if (conversation.id !== report.conversationId) return conversation;
      const shown = conversation.lastMessage?.seq;
      const unreadCount = shown === undefined ? report.unreadCount : Math.max(report.unreadCount, shown - readSeq);
      return unreadCount === conversation.unreadCount ? conversation : { ...conversation, unreadCount };
    }),
  };
}
