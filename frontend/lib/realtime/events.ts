import type { MessageResponse } from "@/lib/api";

/**
 * What the app acts on. `ignored` is any other well-formed event (typing, presence, kinds that do not exist
 * yet): those are known to be events, but nothing here uses them.
 */
export type RealtimeEvent =
  | { type: "message.created"; conversationId: string; message: MessageResponse }
  | { type: "conversation.changed"; conversationId: string }
  /** How far everyone ELSE has got (the lowest of their positions), told to the sender of Messages. */
  | { type: "receipts.updated"; conversationId: string; deliveredUpTo: number; readUpTo: number }
  /** This person's own positions and unread count after a report (from any of their tabs or devices). */
  | { type: "unread.updated"; conversationId: string; deliveredSeq: number; readSeq: number; unreadCount: number }
  | { type: "ignored" };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One frame body as an event, or nothing if it is not an event (or is a kind we act on that lacks what we need). */
export function parseEvent(body: string): RealtimeEvent | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!isObject(payload) || typeof payload.type !== "string") return undefined;

  const conversationId = payload.conversationId;
  switch (payload.type) {
    case "message.created": {
      const message = payload.message;
      if (typeof conversationId !== "string" || !isObject(message)) return undefined;
      if (typeof message.seq !== "number" || typeof message.id !== "string") return undefined;
      return { type: "message.created", conversationId, message: message as MessageResponse };
    }
    case "conversation.changed":
      return typeof conversationId === "string" ? { type: "conversation.changed", conversationId } : undefined;
    case "receipts.updated":
      if (typeof conversationId !== "string" || typeof payload.deliveredUpTo !== "number" || typeof payload.readUpTo !== "number") {
        return undefined;
      }
      return { type: "receipts.updated", conversationId, deliveredUpTo: payload.deliveredUpTo, readUpTo: payload.readUpTo };
    case "unread.updated":
      if (
        typeof conversationId !== "string" ||
        typeof payload.deliveredSeq !== "number" ||
        typeof payload.readSeq !== "number" ||
        typeof payload.unreadCount !== "number"
      ) {
        return undefined;
      }
      return {
        type: "unread.updated",
        conversationId,
        deliveredSeq: payload.deliveredSeq,
        readSeq: payload.readSeq,
        unreadCount: payload.unreadCount,
      };
    default:
      return { type: "ignored" };
  }
}
