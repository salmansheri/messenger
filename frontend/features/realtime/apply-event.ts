import type { ConversationResponse, MessageResponse } from "@/lib/api";
import type { RealtimeEvent } from "@/lib/realtime/events";
import { latestSeq, withMessage, type History } from "@/features/messages/history";

const seqOf = (message: MessageResponse) => message.seq ?? 0;

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
  return { list: [updated, ...list.filter((conversation) => conversation !== known)], refetch: skippedAhead };
}

/**
 * How an event changes a Conversation's loaded history. `catchUp` says a Message skipped ahead of what is loaded, so
 * the ones in between should be fetched.
 */
export function applyToHistory(
  history: History | undefined,
  event: RealtimeEvent,
): { history: History | undefined; catchUp: boolean } {
  if (!history || event.type !== "message.created") return { history, catchUp: false };
  const have = latestSeq(history);
  const seq = seqOf(event.message);
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
