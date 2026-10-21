import type { ConversationResponse, MessagePage, MessageResponse, ReactionView, ReplyQuote } from "@/lib/api";
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

/** The picture on a Message: the thumbnail the server made, or for a Message still being sent the one chosen here. */
export type TimelineImage = { src: string; fullSrc: string; width?: number; height?: number };

export type TimelineItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | {
      kind: "message";
      key: string;
      senderId: string | undefined;
      body: string;
      createdAt: string | undefined;
      /** What the server last said about how far others have got with it (only for the person's own Messages). */
      status?: MessageResponse["status"];
      /** Set while the Message is not confirmed yet. */
      pending?: Pending;
      /** Written by the person looking at the view. */
      mine: boolean;
      /** The first of a run from the same sender: the one that carries the name. */
      startsRun: boolean;
      seq?: number;
      /** The server's id of a confirmed Message (what edit and delete are asked about); none while it is being sent. */
      messageId?: string;
      /** The sender changed the text after sending it. */
      edited: boolean;
      /** Deleted for everyone: only a placeholder is left. */
      deleted: boolean;
      /** Who reacted with what (none for a deleted Message, or one still being sent). */
      reactions: ReactionView[];
      /** The Message this one answers (none for a deleted reply); for one still being sent, what the person chose. */
      replyTo?: ReplyQuote;
      /** The image sent with it (none for a deleted Message). */
      image?: TimelineImage;
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
      messageId: message.id,
      edited: Boolean(message.editedAt) && !message.deletedAt,
      deleted: Boolean(message.deletedAt),
      reactions: message.deletedAt ? [] : (message.reactions ?? []),
      replyTo: message.deletedAt || !message.replyTo ? undefined : message.replyTo,
      image: message.deletedAt || !message.attachment?.thumbnailUrl ? undefined : {
        src: message.attachment.thumbnailUrl,
        fullSrc: message.attachment.url ?? message.attachment.thumbnailUrl,
        width: message.attachment.width,
        height: message.attachment.height,
      },
      seq: message.seq,
      senderId: message.senderId,
      body: message.body ?? "",
      createdAt: message.createdAt,
      status: message.status,
      pending: undefined as Pending | undefined,
    })),
    ...pending
      .filter((entry) => !stored.has(entry.clientMessageId))
      .map((entry) => ({
        key: `pending-${entry.clientMessageId}`,
        messageId: undefined,
        edited: false,
        deleted: false,
        reactions: [] as ReactionView[],
        replyTo: entry.replyTo,
        image: entry.image && { src: entry.image.previewUrl, fullSrc: entry.image.previewUrl, width: entry.image.width, height: entry.image.height },
        seq: undefined,
        senderId: myId,
        body: entry.body,
        createdAt: entry.createdAt,
        status: undefined,
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
      messageId: row.messageId,
      edited: row.edited,
      deleted: row.deleted,
      reactions: row.reactions,
      replyTo: row.replyTo,
      image: row.image,
      senderId: row.senderId,
      body: row.body,
      createdAt: row.createdAt,
      status: row.status,
      pending: row.pending,
      mine: row.senderId === myId,
      startsRun: breaks || row.senderId !== previousSender,
    });
    previousSender = row.senderId;
  }
  return items;
}
