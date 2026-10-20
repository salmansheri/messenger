import { describe, expect, it } from "vitest";
import type { ConversationResponse, MessagePage, MessageResponse } from "@/lib/api";
import type { RealtimeEvent } from "@/lib/realtime/events";
import type { History } from "@/features/messages/history";
import { applyToHistory, applyToList, applyUnread } from "./apply-event";

const ME = "me";

const msg = (seq: number, senderId = "grace", createdAt = `2026-03-10T10:${String(seq).padStart(2, "0")}:00Z`): MessageResponse => ({
  id: `id${seq}`,
  conversationId: "c1",
  seq,
  senderId,
  clientMessageId: `client${seq}`,
  body: `m${seq}`,
  createdAt,
});

const created = (message: MessageResponse, conversationId = "c1"): RealtimeEvent => ({
  type: "message.created",
  conversationId,
  message,
});

const conversation = (id: string, overrides: Partial<ConversationResponse> = {}): ConversationResponse => ({
  id,
  type: "DIRECT",
  unreadCount: 0,
  updatedAt: "2026-03-10T09:00:00Z",
  ...overrides,
});

describe("applyToList", () => {
  const list = [
    conversation("c0", { updatedAt: "2026-03-10T09:30:00Z", lastMessage: msg(7) }),
    conversation("c1", { updatedAt: "2026-03-10T09:00:00Z", lastMessage: msg(2), unreadCount: 1 }),
  ];

  it("shows a new Message as the latest line, counts it as unread and moves its Conversation to the top", () => {
    const result = applyToList(list, created(msg(3)), ME);

    expect(result.refetch).toBe(false);
    expect(result.list.map((c) => c.id)).toEqual(["c1", "c0"]);
    expect(result.list[0].lastMessage?.seq).toBe(3);
    expect(result.list[0].unreadCount).toBe(2);
    expect(result.list[0].updatedAt).toBe("2026-03-10T10:03:00Z");
    expect(list[1].unreadCount, "the old list is not changed").toBe(1);
  });

  it("does not count your own Message as unread (sending reads everything before it)", () => {
    const result = applyToList(list, created(msg(3, ME)), ME);
    expect(result.list[0].unreadCount).toBe(0);
    expect(result.list[0].lastMessage?.senderId).toBe(ME);
  });

  it("does nothing the second time it hears the same Message", () => {
    const once = applyToList(list, created(msg(3)), ME);
    const twice = applyToList(once.list, created(msg(3)), ME);
    expect(twice.list).toEqual(once.list);
    expect(twice.refetch).toBe(false);
  });

  it("ignores a Message older than the latest one it already shows (out of order)", () => {
    const afterThree = applyToList(list, created(msg(3)), ME);
    const lateTwo = applyToList(afterThree.list, created(msg(2)), ME);
    expect(lateTwo.list).toEqual(afterThree.list);
  });

  it("asks for the list again when a Message skips ahead, because the unread count can no longer be trusted", () => {
    const result = applyToList(list, created(msg(5)), ME);
    expect(result.list[0].lastMessage?.seq).toBe(5);
    expect(result.refetch).toBe(true);
  });

  it("asks for the list again when the Conversation is not in it (a new one, or one just joined)", () => {
    const result = applyToList(list, created(msg(1), "unknown"), ME);
    expect(result.list).toBe(list);
    expect(result.refetch).toBe(true);
  });

  it("takes a first Message in a Conversation that had none", () => {
    const empty = [conversation("c1")];
    const result = applyToList(empty, created(msg(1)), ME);
    expect(result.list[0].lastMessage?.seq).toBe(1);
    expect(result.list[0].unreadCount).toBe(1);
    expect(result.refetch).toBe(false);
  });

  it("asks for the list again when a Conversation changed, and changes nothing else", () => {
    const result = applyToList(list, { type: "conversation.changed", conversationId: "c1" }, ME);
    expect(result.list).toBe(list);
    expect(result.refetch).toBe(true);
  });

  it("leaves the list alone for kinds of event it does not act on", () => {
    const result = applyToList(list, { type: "ignored" }, ME);
    expect(result.list).toBe(list);
    expect(result.refetch).toBe(false);
  });

  it("without knowing who you are, asks for the list rather than guess the unread count", () => {
    expect(applyToList(list, created(msg(3)), undefined).refetch).toBe(true);
  });
});

describe("applyToHistory", () => {
  const page = (...seqs: number[]): MessagePage => ({ messages: seqs.map((seq) => msg(seq)), hasMore: false });
  const history = { pages: [page(4, 5, 6), page(1, 2, 3)], pageParams: [undefined, 4] };

  it("adds a new Message to the newest page", () => {
    const result = applyToHistory(history, created(msg(7)));
    expect(result.history?.pages[0].messages?.map((m) => m.seq)).toEqual([4, 5, 6, 7]);
    expect(result.history?.pages[1]).toBe(history.pages[1]);
    expect(result.catchUp).toBe(false);
  });

  it("keeps one copy when the same Message arrives twice", () => {
    const once = applyToHistory(history, created(msg(7))).history!;
    const twice = applyToHistory(once, created(msg(7)));
    expect(twice.history?.pages[0].messages?.map((m) => m.seq)).toEqual([4, 5, 6, 7]);
  });

  it("keeps a Message that is already there as it is, even one that arrives late", () => {
    const result = applyToHistory(history, created(msg(5)));
    expect(result.history?.pages[0].messages?.map((m) => m.seq)).toEqual([4, 5, 6]);
    expect(result.catchUp).toBe(false);
  });

  it("takes a Message that arrives before an earlier one, and the gap is asked about", () => {
    const result = applyToHistory(history, created(msg(9)));
    expect(result.history?.pages[0].messages?.map((m) => m.seq)).toEqual([4, 5, 6, 9]);
    expect(result.catchUp).toBe(true);
  });

  it("does nothing when no history is loaded for the Conversation", () => {
    expect(applyToHistory(undefined, created(msg(7)))).toEqual({ history: undefined, catchUp: false });
  });

  it("does not worry about a gap in a history that has no Messages (it may only start later)", () => {
    const empty = { pages: [{ messages: [], hasMore: false }], pageParams: [undefined] };
    expect(applyToHistory(empty, created(msg(6))).catchUp).toBe(false);
  });

  it("ignores events that are not new Messages", () => {
    expect(applyToHistory(history, { type: "conversation.changed", conversationId: "c1" })).toEqual({
      history,
      catchUp: false,
    });
    expect(applyToHistory(history, { type: "ignored" }).history).toBe(history);
  });
});

const updated = (message: MessageResponse, conversationId = "c1"): RealtimeEvent => ({
  type: "message.updated",
  conversationId,
  message,
});

describe("applyToList for an edited or deleted Message", () => {
  const list = [conversation("c1", { lastMessage: { ...msg(3, ME), status: "DELIVERED" }, unreadCount: 2, updatedAt: "2026-03-10T09:00:00Z" })];

  it("shows the new text on the latest line without touching the count or the order", () => {
    const result = applyToList(list, updated({ ...msg(3, ME), body: "fixed", editedAt: "2026-03-10T10:05:00Z" }), ME);

    expect(result.refetch).toBe(false);
    expect(result.list[0].lastMessage?.body).toBe("fixed");
    expect(result.list[0].lastMessage?.status, "the sender's own status is kept").toBe("DELIVERED");
    expect(result.list[0].unreadCount).toBe(2);
    expect(result.list[0].updatedAt).toBe("2026-03-10T09:00:00Z");
  });

  it("shows a deleted latest Message as deleted", () => {
    const result = applyToList(list, updated({ id: "id3", conversationId: "c1", seq: 3, senderId: ME, deletedAt: "2026-03-10T10:06:00Z" }), ME);

    expect(result.list[0].lastMessage?.deletedAt).toBe("2026-03-10T10:06:00Z");
    expect(result.list[0].lastMessage?.body).toBeUndefined();
  });

  it("changes nothing for a Message that is not the latest line", () => {
    const result = applyToList(list, updated({ ...msg(2), body: "older, edited", editedAt: "2026-03-10T10:05:00Z" }), ME);

    expect(result).toEqual({ list, refetch: false });
  });

  it("changes nothing when it is an older version than the one shown", () => {
    const shown = [conversation("c1", { lastMessage: { ...msg(3), body: "two", editedAt: "2026-03-10T10:05:00Z" } })];

    const result = applyToList(shown, updated({ ...msg(3), body: "one", editedAt: "2026-03-10T10:00:00Z" }), ME);

    expect(result.list).toBe(shown);
  });

  it("asks again when the Conversation is unknown or the Message is newer than the latest line (one was missed)", () => {
    expect(applyToList(list, updated(msg(3), "other"), ME).refetch).toBe(true);
    expect(applyToList(list, updated({ ...msg(5), editedAt: "2026-03-10T10:05:00Z" }), ME).refetch).toBe(true);
  });
});

describe("applyToHistory for an edited or deleted Message", () => {
  const loaded = (): History => ({ pages: [{ messages: [msg(2), { ...msg(3, ME), status: "READ" }], hasMore: false }], pageParams: [{}] });

  it("replaces the Message in place and keeps the sender's status", () => {
    const result = applyToHistory(loaded(), updated({ ...msg(3, ME), body: "fixed", editedAt: "2026-03-10T10:05:00Z" }));

    expect(result.catchUp).toBe(false);
    expect(result.history?.pages[0].messages?.map((m) => m.body)).toEqual(["m2", "fixed"]);
    expect(result.history?.pages[0].messages?.[1].status).toBe("READ");
  });

  it("never brings back the text of a Message already deleted, however late the edit arrives", () => {
    const deletedAlready: History = { pages: [{ messages: [msg(2), { id: "id3", conversationId: "c1", seq: 3, senderId: ME, deletedAt: "2026-03-10T10:06:00Z" }], hasMore: false }], pageParams: [{}] };

    const result = applyToHistory(deletedAlready, updated({ ...msg(3, ME), body: "fixed", editedAt: "2026-03-10T10:09:00Z" }));

    expect(result.history).toBe(deletedAlready);
  });

  it("ignores an update to a Message older than anything loaded", () => {
    const history = loaded();

    expect(applyToHistory(history, updated({ ...msg(1), editedAt: "2026-03-10T10:05:00Z" }))).toEqual({ history, catchUp: false });
  });

  it("takes a Message newer than the newest as if it had just arrived, and asks to catch up over a gap", () => {
    const result = applyToHistory(loaded(), updated({ ...msg(5), editedAt: "2026-03-10T10:05:00Z" }));

    expect(result.history?.pages[0].messages?.map((m) => m.seq)).toEqual([2, 3, 5]);
    expect(result.catchUp).toBe(true);
  });

  it("does nothing when no history is loaded", () => {
    expect(applyToHistory(undefined, updated(msg(3)))).toEqual({ history: undefined, catchUp: false });
  });
});

describe("applyToList for a change to the person's own settings", () => {
  const changed = (settings: ConversationResponse["settings"], conversationId = "c1"): RealtimeEvent => ({
    type: "settings.changed",
    conversationId,
    settings: settings ?? {},
  });
  const list = [
    conversation("c0", { updatedAt: "2026-03-10T11:00:00Z", settings: { muted: false, archived: false, pinned: false } }),
    conversation("c1", { updatedAt: "2026-03-10T09:00:00Z", settings: { muted: false, archived: false, pinned: false } }),
  ];

  it("takes the new settings and moves a newly pinned Conversation to the top", () => {
    const result = applyToList(list, changed({ muted: false, archived: false, pinned: true }), ME);

    expect(result.refetch).toBe(false);
    expect(result.list.map((c) => c.id)).toEqual(["c1", "c0"]);
    expect(result.list[0].settings?.pinned).toBe(true);
  });

  it("changes nothing when the settings are the same as the ones shown", () => {
    const result = applyToList(list, changed({ muted: false, archived: false, pinned: false }), ME);

    expect(result.list).toBe(list);
  });

  it("asks for the list again for a Conversation it does not know", () => {
    expect(applyToList(list, changed({ pinned: true }, "other"), ME).refetch).toBe(true);
  });

  it("keeps pinned Conversations above a Conversation that just got a new Message", () => {
    const pinned = [
      conversation("p", { updatedAt: "2026-03-01T09:00:00Z", settings: { muted: false, archived: false, pinned: true } }),
      conversation("c1", { updatedAt: "2026-03-10T09:00:00Z", lastMessage: msg(2), settings: { muted: false, archived: false, pinned: false } }),
    ];

    const result = applyToList(pinned, created(msg(3)), ME);

    expect(result.list.map((c) => c.id)).toEqual(["p", "c1"]);
  });
});

describe("applyToHistory for reactions", () => {
  const withReactions = (): History => ({
    pages: [{ messages: [msg(2), { ...msg(3), reactions: [{ emoji: "x", userIds: ["a"] }] }], hasMore: false }],
    pageParams: [{}],
  });
  const reacted = (userId: string, emoji: string | null, messageId = "id3"): RealtimeEvent => ({
    type: "reaction.changed",
    conversationId: "c1",
    messageId,
    seq: 3,
    userId,
    emoji,
    at: "2026-03-10T10:00:00Z",
  });

  it("puts a person's reaction on the Message and keeps it apart from the others", () => {
    const result = applyToHistory(withReactions(), reacted("b", "x"));

    expect(result.catchUp).toBe(false);
    expect(result.history?.pages[0].messages?.[1].reactions).toEqual([{ emoji: "x", userIds: ["a", "b"] }]);
    expect(result.history?.pages[0].messages?.[0].reactions).toBeUndefined();
  });

  it("moves a person who changed their mind and removes one who took it away", () => {
    const moved = applyToHistory(withReactions(), reacted("a", "y"));
    expect(moved.history?.pages[0].messages?.[1].reactions).toEqual([{ emoji: "y", userIds: ["a"] }]);

    const removed = applyToHistory(withReactions(), reacted("a", null));
    expect(removed.history?.pages[0].messages?.[1].reactions).toEqual([]);
  });

  it("changes nothing for a Message that is not loaded, or for a reaction already there", () => {
    const history = withReactions();

    expect(applyToHistory(history, reacted("b", "x", "unknown")).history).toBe(history);
    expect(applyToHistory(history, reacted("a", "x")).history).toBe(history);
    expect(applyToHistory(undefined, reacted("a", "x"))).toEqual({ history: undefined, catchUp: false });
  });

  it("takes someone out of every Message when their reactions were cleared (they left)", () => {
    const result = applyToHistory(withReactions(), { type: "reactions.cleared", conversationId: "c1", userId: "a" });

    expect(result.history?.pages[0].messages?.[1].reactions).toEqual([]);
  });
});

describe("applyUnread", () => {
  const list = [
    conversation("c0", { lastMessage: msg(7), unreadCount: 3 }),
    conversation("c1", { lastMessage: msg(5), unreadCount: 4 }),
  ];
  const report = (readSeq: number, unreadCount: number, conversationId = "c1") => ({ conversationId, readSeq, unreadCount });

  it("takes the unread count the server worked out for this person (their other tab or device may have read)", () => {
    const result = applyUnread(list, undefined, report(5, 0));
    expect(result.list.find((c) => c.id === "c1")?.unreadCount).toBe(0);
    expect(result.list.map((c) => c.id), "the order does not change").toEqual(["c0", "c1"]);
    expect(result.readSeq).toBe(5);
  });

  it("does not undercount when a newer Message is already shown than the one the server counted", () => {
    // The server says read up to 3 with 2 unread (so it knew of 5), but the list already shows Message 5... and 7 here.
    const result = applyUnread(list, undefined, report(3, 1, "c0"));
    expect(result.list.find((c) => c.id === "c0")?.unreadCount, "7 - 3, not the stale 1").toBe(4);
  });

  it("trusts the server's count when the list knows less than it does", () => {
    const result = applyUnread(list, undefined, report(1, 9));
    expect(result.list.find((c) => c.id === "c1")?.unreadCount).toBe(9);
  });

  it("ignores a report older than one already applied (out of order), and the same one twice changes nothing", () => {
    const newer = applyUnread(list, undefined, report(5, 0));
    const older = applyUnread(newer.list, newer.readSeq, report(2, 3));
    expect(older.list).toBe(newer.list);
    expect(older.readSeq).toBe(5);

    const again = applyUnread(newer.list, newer.readSeq, report(5, 0));
    expect(again.list).toEqual(newer.list);
  });

  it("does nothing about a Conversation it does not show", () => {
    const result = applyUnread(list, undefined, report(1, 0, "nope"));
    expect(result.list).toBe(list);
  });
});
