import { describe, expect, it } from "vitest";
import type { ConversationResponse, MessagePage, MessageResponse } from "@/lib/api";
import type { RealtimeEvent } from "@/lib/realtime/events";
import { applyToHistory, applyToList } from "./apply-event";

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

  it("asks for the list again when a Conversation changed, and only changes nothing else", () => {
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
