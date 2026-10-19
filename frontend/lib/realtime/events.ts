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

/** The named fields of an object as numbers, or nothing if any is missing or not a number. */
function numbers<K extends string>(payload: Record<string, unknown>, keys: readonly K[]): Record<K, number> | undefined {
  const found = {} as Record<K, number>;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== "number") return undefined;
    found[key] = value;
  }
  return found;
}

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
    case "receipts.updated": {
      const found = numbers(payload, ["deliveredUpTo", "readUpTo"]);
      return typeof conversationId === "string" && found ? { type: "receipts.updated", conversationId, ...found } : undefined;
    }
    case "unread.updated": {
      const found = numbers(payload, ["deliveredSeq", "readSeq", "unreadCount"]);
      return typeof conversationId === "string" && found ? { type: "unread.updated", conversationId, ...found } : undefined;
    }
    default:
      return { type: "ignored" };
  }
}
