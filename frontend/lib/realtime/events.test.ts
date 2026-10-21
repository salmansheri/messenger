import { describe, expect, it } from "vitest";
import { parseEvent } from "./events";

const message = { id: "m1", conversationId: "c1", seq: 4, senderId: "u1", clientMessageId: "x", body: "Hi" };

describe("parseEvent", () => {
  it("reads a new Message", () => {
    expect(parseEvent(JSON.stringify({ type: "message.created", conversationId: "c1", message }))).toEqual({
      type: "message.created",
      conversationId: "c1",
      message,
    });
  });

  it("reads an edited or deleted Message", () => {
    const edited = { ...message, body: "Hello", editedAt: "2026-03-10T10:05:00Z" };
    const deleted = { ...message, body: undefined, deletedAt: "2026-03-10T10:06:00Z" };

    expect(parseEvent(JSON.stringify({ type: "message.updated", conversationId: "c1", message: edited }))).toEqual({
      type: "message.updated",
      conversationId: "c1",
      message: edited,
    });
    expect(parseEvent(JSON.stringify({ type: "message.updated", conversationId: "c1", message: deleted }))).toEqual({
      type: "message.updated",
      conversationId: "c1",
      message: deleted,
    });
  });

  it("refuses an update with no Message, no Conversation or no place in it", () => {
    expect(parseEvent(JSON.stringify({ type: "message.updated", conversationId: "c1" }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "message.updated", message }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "message.updated", conversationId: "c1", message: { id: "m1" } }))).toBeUndefined();
  });

  it("reads a change to the person's own settings for a Conversation", () => {
    const settings = { muted: true, mutedUntil: "2026-03-10T20:00:00Z", archived: false, pinned: true };

    expect(parseEvent(JSON.stringify({ type: "settings.changed", conversationId: "c1", settings }))).toEqual({
      type: "settings.changed",
      conversationId: "c1",
      settings,
    });
  });

  it("refuses a settings change with no settings or no Conversation", () => {
    expect(parseEvent(JSON.stringify({ type: "settings.changed", conversationId: "c1" }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "settings.changed", settings: { pinned: true } }))).toBeUndefined();
  });

  it("reads someone putting a reaction on a Message, replacing it, or taking it away", () => {
    const put = { type: "reaction.changed", conversationId: "c1", messageId: "m1", seq: 4, userId: "u2", emoji: "\uD83D\uDC4D", at: "2026-03-10T10:00:00Z" };

    expect(parseEvent(JSON.stringify(put))).toEqual(put);
    expect(parseEvent(JSON.stringify({ ...put, emoji: null }))).toEqual({ ...put, emoji: null });
  });

  it("refuses a reaction event that lacks who, which Message or when", () => {
    const put = { type: "reaction.changed", conversationId: "c1", messageId: "m1", seq: 4, userId: "u2", emoji: "x", at: "t" };

    for (const missing of ["conversationId", "messageId", "userId", "at"]) {
      const broken: Record<string, unknown> = { ...put };
      delete broken[missing];
      expect(parseEvent(JSON.stringify(broken)), missing).toBeUndefined();
    }
  });

  it("reads the reactions of someone who left being cleared", () => {
    expect(parseEvent(JSON.stringify({ type: "reactions.cleared", conversationId: "c1", userId: "u2" }))).toEqual({
      type: "reactions.cleared",
      conversationId: "c1",
      userId: "u2",
    });
    expect(parseEvent(JSON.stringify({ type: "reactions.cleared", conversationId: "c1" }))).toBeUndefined();
  });

  it("reads a change to a Conversation", () => {
    expect(parseEvent(JSON.stringify({ type: "conversation.changed", conversationId: "c1" }))).toEqual({
      type: "conversation.changed",
      conversationId: "c1",
    });
  });

  it("reads how far everyone else has got", () => {
    expect(
      parseEvent(JSON.stringify({ type: "receipts.updated", conversationId: "c1", deliveredUpTo: 5, readUpTo: 3 })),
    ).toEqual({ type: "receipts.updated", conversationId: "c1", deliveredUpTo: 5, readUpTo: 3 });
  });

  it("reads the person's own new unread count", () => {
    expect(
      parseEvent(
        JSON.stringify({ type: "unread.updated", conversationId: "c1", deliveredSeq: 9, readSeq: 8, unreadCount: 1 }),
      ),
    ).toEqual({ type: "unread.updated", conversationId: "c1", deliveredSeq: 9, readSeq: 8, unreadCount: 1 });
  });

  it("refuses receipt and unread events with numbers missing, rather than guessing", () => {
    expect(parseEvent(JSON.stringify({ type: "receipts.updated", conversationId: "c1", deliveredUpTo: 5 }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "receipts.updated", deliveredUpTo: 5, readUpTo: 3 }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "unread.updated", conversationId: "c1", unreadCount: "1" }))).toBeUndefined();
  });

  it("reads that someone started or stopped typing", () => {
    expect(
      parseEvent(JSON.stringify({ type: "typing.changed", conversationId: "c1", userId: "u1", typing: true })),
    ).toEqual({ type: "typing.changed", conversationId: "c1", userId: "u1", typing: true });
    expect(parseEvent(JSON.stringify({ type: "typing.changed", conversationId: "c1", userId: "u1" }))).toBeUndefined();
  });

  it("reads that someone came online or went offline, with when they were last seen", () => {
    expect(parseEvent(JSON.stringify({ type: "presence.changed", userId: "u1", online: true, lastSeenAt: null }))).toEqual({
      type: "presence.changed",
      userId: "u1",
      online: true,
      lastSeenAt: undefined,
    });
    expect(
      parseEvent(JSON.stringify({ type: "presence.changed", userId: "u1", online: false, lastSeenAt: "2026-03-10T10:00:00Z" })),
    ).toEqual({ type: "presence.changed", userId: "u1", online: false, lastSeenAt: "2026-03-10T10:00:00Z" });
    expect(parseEvent(JSON.stringify({ type: "presence.changed", online: true }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "presence.changed", userId: "u1" }))).toBeUndefined();
  });

  it("reads a name change, and drops one that does not say who or what", () => {
    expect(parseEvent(JSON.stringify({ type: "profile.changed", userId: "u1", displayName: "Ada King" }))).toEqual({
      type: "profile.changed",
      userId: "u1",
      changes: { displayName: "Ada King" },
    });
    expect(parseEvent(JSON.stringify({ type: "profile.changed", displayName: "Ada King" }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "profile.changed", userId: "u1" }))).toBeUndefined();
  });

  it("reads a new or removed Avatar, keeping only the keys the server sent", () => {
    const url = "http://localhost:8080/api/v1/files/avatars/u1/a.png?expires=1&signature=x";
    expect(parseEvent(JSON.stringify({ type: "profile.changed", userId: "u1", avatarUrl: url }))).toEqual({
      type: "profile.changed",
      userId: "u1",
      changes: { avatarUrl: url },
    });
    // null is a removal, which is not the same as the key being absent (a name change says nothing about the picture)
    expect(parseEvent(JSON.stringify({ type: "profile.changed", userId: "u1", avatarUrl: null }))).toEqual({
      type: "profile.changed",
      userId: "u1",
      changes: { avatarUrl: null },
    });
    expect(parseEvent(JSON.stringify({ type: "profile.changed", userId: "u1", avatarUrl: 42 }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "profile.changed", userId: "u1", displayName: 7, avatarUrl: url }))).toBeUndefined();
  });

  it("knows about kinds it does not act on, and about kinds it has never heard of, without failing", () => {
    for (const type of ["something.new", "auth.revoked"]) {
      expect(parseEvent(JSON.stringify({ type, conversationId: "c1" }))).toEqual({ type: "ignored" });
    }
  });

  it("refuses what is not an event at all", () => {
    for (const body of ["", "not json", "null", "42", "[]", JSON.stringify({ no: "type" })]) {
      expect(parseEvent(body)).toBeUndefined();
    }
  });

  it("refuses a Message event with no Message or no Conversation, rather than guessing", () => {
    expect(parseEvent(JSON.stringify({ type: "message.created", conversationId: "c1" }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "message.created", message }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "message.created", conversationId: "c1", message: { id: "m1" } }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "conversation.changed" }))).toBeUndefined();
  });
});
