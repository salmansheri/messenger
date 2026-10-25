import type { ConversationSettings, MessageResponse, StoryResponse, UserProfile } from "@/lib/api";

/** How someone says they can be reached (GLOSSARY "Availability"). */
export type Availability = NonNullable<UserProfile["availability"]>;

const AVAILABILITIES: readonly string[] = ["AVAILABLE", "BUSY", "AWAY"] satisfies Availability[];

/**
 * What the app acts on. `ignored` is any other well-formed event (a kind that does not exist yet): it is known to be
 * an event, but nothing here uses it.
 */
export type RealtimeEvent =
  | { type: "message.created"; conversationId: string; message: MessageResponse }
  /** A Message was edited or deleted for everyone (no `status`: that is the sender's own view). */
  | { type: "message.updated"; conversationId: string; message: MessageResponse }
  | { type: "conversation.changed"; conversationId: string }
  /** Someone put a reaction on a Message, replaced it (`emoji`), or took it away (`emoji` is null). */
  | { type: "reaction.changed"; conversationId: string; messageId: string; seq: number | undefined; userId: string; emoji: string | null; at: string }
  /** Everything one person reacted with in the Conversation is gone (they left or were removed). */
  | { type: "reactions.cleared"; conversationId: string; userId: string }
  /** This person's own mute, archive or pin changed, from any of their tabs or devices. */
  | { type: "settings.changed"; conversationId: string; settings: ConversationSettings }
  /** How far everyone ELSE has got (the lowest of their positions), told to the sender of Messages. */
  | { type: "receipts.updated"; conversationId: string; deliveredUpTo: number; readUpTo: number }
  /** This person's own positions and unread count after a report (from any of their tabs or devices). */
  | { type: "unread.updated"; conversationId: string; deliveredSeq: number; readSeq: number; unreadCount: number }
  /** Someone started (`typing: true`) or stopped typing. Never stored on the server. */
  | { type: "typing.changed"; conversationId: string; userId: string; typing: boolean }
  /** Someone who shares a Conversation with this person came online or went offline. */
  | { type: "presence.changed"; userId: string; online: boolean; lastSeenAt: string | undefined }
  /** Someone whose presence this person sees (or this person, in another session) changed their Availability. */
  | { type: "availability.changed"; userId: string; availability: Availability }
  /**
   * Someone who shares a Conversation with this person (or this person, in another session) changed their name or
   * Avatar. Only what changed is there: a name change says nothing about the picture, and `avatarUrl: null` is a removal.
   */
  | { type: "profile.changed"; userId: string; changes: ProfileChanges }
  /** This person blocked (`blocked: true`) or unblocked someone, in any of their tabs or devices. Never sent to the other. */
  | { type: "block.changed"; userId: string; blocked: boolean }
  | StoryEvent
  | { type: "ignored" };

/**
 * A Story was posted (to the poster's audience and their own sessions), removed (deleted or expired, to the same
 * people), or viewed for the first time (to the poster's own sessions, with the count they see).
 */
export type StoryEvent =
  | { type: "story.posted"; story: StoryResponse; poster: { userId: string; displayName?: string; avatarUrl?: string } }
  | { type: "story.removed"; storyId: string; posterId: string }
  | { type: "story.viewed"; storyId: string; viewerId: string; viewedAt: string; viewCount: number };

/** What a `profile.changed` event changes; a key that is absent was not changed. */
export type ProfileChanges = { displayName?: string; avatarUrl?: string | null };

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
    case "message.updated": {
      const message = payload.message;
      if (typeof conversationId !== "string" || !isObject(message)) return undefined;
      if (typeof message.seq !== "number" || typeof message.id !== "string") return undefined;
      return { type: "message.updated", conversationId, message: message as MessageResponse };
    }
    case "reaction.changed":
      if (typeof conversationId !== "string" || typeof payload.messageId !== "string") return undefined;
      if (typeof payload.userId !== "string" || typeof payload.at !== "string") return undefined;
      return {
        type: "reaction.changed",
        conversationId,
        messageId: payload.messageId,
        seq: typeof payload.seq === "number" ? payload.seq : undefined,
        userId: payload.userId,
        emoji: typeof payload.emoji === "string" ? payload.emoji : null,
        at: payload.at,
      };
    case "reactions.cleared":
      return typeof conversationId === "string" && typeof payload.userId === "string"
        ? { type: "reactions.cleared", conversationId, userId: payload.userId }
        : undefined;
    case "settings.changed":
      return typeof conversationId === "string" && isObject(payload.settings)
        ? { type: "settings.changed", conversationId, settings: payload.settings as ConversationSettings }
        : undefined;
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
    case "typing.changed":
      return typeof conversationId === "string" && typeof payload.userId === "string" && typeof payload.typing === "boolean"
        ? { type: "typing.changed", conversationId, userId: payload.userId, typing: payload.typing }
        : undefined;
    case "presence.changed":
      if (typeof payload.userId !== "string" || typeof payload.online !== "boolean") return undefined;
      return {
        type: "presence.changed",
        userId: payload.userId,
        online: payload.online,
        lastSeenAt: typeof payload.lastSeenAt === "string" ? payload.lastSeenAt : undefined,
      };
    case "availability.changed":
      return typeof payload.userId === "string" && typeof payload.availability === "string" && AVAILABILITIES.includes(payload.availability)
        ? { type: "availability.changed", userId: payload.userId, availability: payload.availability as Availability }
        : undefined;
    case "profile.changed": {
      if (typeof payload.userId !== "string") return undefined;
      const changes: ProfileChanges = {};
      if ("displayName" in payload) {
        if (typeof payload.displayName !== "string") return undefined;
        changes.displayName = payload.displayName;
      }
      if ("avatarUrl" in payload) {
        if (typeof payload.avatarUrl !== "string" && payload.avatarUrl !== null) return undefined;
        changes.avatarUrl = payload.avatarUrl;
      }
      return Object.keys(changes).length > 0 ? { type: "profile.changed", userId: payload.userId, changes } : undefined;
    }
    case "block.changed":
      return typeof payload.userId === "string" && typeof payload.blocked === "boolean"
        ? { type: "block.changed", userId: payload.userId, blocked: payload.blocked }
        : undefined;
    case "story.posted": {
      const story = payload.story;
      const poster = payload.poster;
      if (!isObject(story) || typeof story.id !== "string" || !isObject(poster) || typeof poster.userId !== "string") return undefined;
      return {
        type: "story.posted",
        story: story as StoryResponse,
        poster: {
          userId: poster.userId,
          displayName: typeof poster.displayName === "string" ? poster.displayName : undefined,
          avatarUrl: typeof poster.avatarUrl === "string" ? poster.avatarUrl : undefined,
        },
      };
    }
    case "story.removed":
      return typeof payload.storyId === "string" && typeof payload.posterId === "string"
        ? { type: "story.removed", storyId: payload.storyId, posterId: payload.posterId }
        : undefined;
    case "story.viewed":
      return typeof payload.storyId === "string" && typeof payload.viewerId === "string" && typeof payload.viewedAt === "string" && typeof payload.viewCount === "number"
        ? { type: "story.viewed", storyId: payload.storyId, viewerId: payload.viewerId, viewedAt: payload.viewedAt, viewCount: payload.viewCount }
        : undefined;
    default:
      return { type: "ignored" };
  }
}
