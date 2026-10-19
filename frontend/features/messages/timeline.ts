import type { ConversationResponse, MessagePage, MessageResponse } from "@/lib/api";
import { formatDay } from "@/features/conversations/present";
import type { Pending } from "./outbox";

/** Pages of history (any order) as one list in `seq` order, each Message once. */
export function confirmedMessages(pages: readonly MessagePage[]): MessageResponse[] {
  const bySeq = new Map<number, MessageResponse>();
  for (const page of pages) for (const message of page.messages ?? []) if (message.seq !== undefined) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/** The first Message the person has not read, from the unread count (the last `unreadCount` Messages are the unread ones). */
export function firstUnreadSeq(conversation: Pick<ConversationResponse, "unreadCount" | "lastMessage">): number | undefined {
  const latest = conversation.lastMessage?.seq;
  const unread = conversation.unreadCount ?? 0;
  if (latest === undefined || unread < 1) return undefined;
  return latest - unread + 1;
}

export type TimelineItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | {
      kind: "message";
      key: string;
      senderId: string | undefined;
      body: string;
      createdAt: string | undefined;
      /** Set while the Message is not confirmed yet. */
      pending?: Pending;
      /** Written by the person looking at the view. */
      mine: boolean;
      /** The first of a run from the same sender: the one that carries the name. */
      startsRun: boolean;
      seq?: number;
    };

type Input = {
  confirmed: readonly MessageResponse[];
  pending: readonly Pending[];
  myId?: string;
  firstUnreadSeq: number | undefined;
  now: Date;
  timeZone?: string;
};

/**
 * What the Message view shows, top to bottom: a heading for each day, an unread mark, and the Messages with the name
 * on the first of each run from one sender. Messages still being sent come last as the person's own, except any the
 * server has already confirmed (it can arrive before the sender's own answer does).
 */
export function buildTimeline({ confirmed, pending, myId, firstUnreadSeq, now, timeZone }: Input): TimelineItem[] {
  const stored = new Set(confirmed.map((message) => message.clientMessageId));
  const rows = [
    ...confirmed.map((message) => ({
      key: `seq-${message.seq}`,
      seq: message.seq,
      senderId: message.senderId,
      body: message.body ?? "",
      createdAt: message.createdAt,
      pending: undefined as Pending | undefined,
    })),
    ...pending
      .filter((entry) => !stored.has(entry.clientMessageId))
      .map((entry) => ({
        key: `pending-${entry.clientMessageId}`,
        seq: undefined,
        senderId: myId,
        body: entry.body,
        createdAt: entry.createdAt,
        pending: entry,
      })),
  ];

  const items: TimelineItem[] = [];
  let day: string | undefined;
  let previousSender: string | undefined;
  for (const row of rows) {
    const label = formatDay(row.createdAt, now, timeZone);
    let breaks = false;
    if (label !== day) {
      items.push({ kind: "day", key: `day-${row.key}`, label });
      day = label;
      breaks = true;
    }
    if (firstUnreadSeq !== undefined && row.seq === firstUnreadSeq) {
      items.push({ kind: "unread", key: "unread" });
      breaks = true;
    }
    items.push({
      kind: "message",
      key: row.key,
      seq: row.seq,
      senderId: row.senderId,
      body: row.body,
      createdAt: row.createdAt,
      pending: row.pending,
      mine: row.senderId === myId,
      startsRun: breaks || row.senderId !== previousSender,
    });
    previousSender = row.senderId;
  }
  return items;
}
