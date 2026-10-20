import { describe, expect, it } from "vitest";
import type { MessagePage, MessageResponse } from "@/lib/api";
import { markDeleted, oldestSeq, removeById, removeMessage, replaceMessage, syncRange, type History } from "./history";

const msg = (seq: number, overrides: Partial<MessageResponse> = {}): MessageResponse => ({
  id: `id${seq}`,
  conversationId: "c1",
  seq,
  senderId: "grace",
  body: `m${seq}`,
  ...overrides,
});

const page = (...seqs: number[]): MessagePage => ({ messages: seqs.map((seq) => msg(seq)), hasMore: false });

/** Newest page first, as the app keeps it. */
const history = (...pages: MessagePage[]): History => ({ pages, pageParams: pages.map(() => ({})) });

const seqs = (h: History) => h.pages.map((p) => (p.messages ?? []).map((m) => m.seq));

describe("oldestSeq", () => {
  it("is the lowest Sequence number loaded, or nothing when none is", () => {
    expect(oldestSeq(history(page(5, 6), page(3, 4)))).toBe(3);
    expect(oldestSeq(history())).toBeUndefined();
    expect(oldestSeq(history({ messages: [], hasMore: false }))).toBeUndefined();
  });
});

describe("replaceMessage", () => {
  it("swaps a Message in the page that holds it and leaves the rest alone", () => {
    const before = history(page(5, 6), page(3, 4));

    const after = replaceMessage(before, msg(4, { body: "edited" }));

    expect(after.pages[1].messages?.[1].body).toBe("edited");
    expect(after.pages[0]).toBe(before.pages[0]);
    expect(seqs(after)).toEqual([[5, 6], [3, 4]]);
  });

  it("adds a Message that is not loaded to the newest page", () => {
    expect(seqs(replaceMessage(history(page(5, 6), page(3, 4)), msg(7)))).toEqual([[5, 6, 7], [3, 4]]);
  });
});

describe("removeMessage", () => {
  it("takes a Message out of whichever page has it", () => {
    expect(seqs(removeMessage(history(page(5, 6), page(3, 4)), 4))).toEqual([[5, 6], [3]]);
  });

  it("returns the same history when the Message is not there", () => {
    const before = history(page(5, 6));
    expect(removeMessage(before, 9)).toBe(before);
  });
});

describe("syncRange", () => {
  it("makes the loaded Messages from a point on match what the server says now", () => {
    const before = history(page(5, 6, 7), page(3, 4));
    const fresh = [msg(4, { body: "edited", editedAt: "2026-03-10T10:05:00Z" }), msg(5), msg(7, { body: undefined, deletedAt: "2026-03-10T10:00:00Z" }), msg(8)];

    const after = syncRange(before, fresh, 3, 8);

    // 3 and 6 are gone from the server's view (hidden by this person elsewhere), 8 is new.
    expect(seqs(after)).toEqual([[5, 7, 8], [4]]);
    expect(after.pages[1].messages?.[0].body).toBe("edited");
    expect(after.pages[0].messages?.[1].deletedAt).toBe("2026-03-10T10:00:00Z");
  });

  it("keeps what is older than the point it was asked from", () => {
    expect(seqs(syncRange(history(page(5, 6), page(1, 2)), [msg(5), msg(6)], 5, 6))).toEqual([[5, 6], [1, 2]]);
  });

  it("leaves alone a loaded Message newer than the range that was fetched (it may have arrived live meanwhile)", () => {
    expect(seqs(syncRange(history(page(5, 6, 9)), [msg(5), msg(6)], 5, 6))).toEqual([[5, 6, 9]]);
  });

  it("drops every loaded Message in the range when the server shows none of them (all hidden elsewhere)", () => {
    expect(seqs(syncRange(history(page(5, 6, 7), page(3, 4)), [], 3, 7))).toEqual([[], []]);
  });

  it("never lets a stale copy undo a newer version that arrived live while the range was being fetched", () => {
    const deleted = msg(6, { body: undefined, deletedAt: "2026-03-10T10:06:00Z" });
    const edited = msg(5, { body: "newest text", editedAt: "2026-03-10T10:09:00Z" });

    const after = syncRange(history({ messages: [edited, deleted], hasMore: false }), [msg(5), msg(6)], 5, 6);

    expect(after.pages[0].messages?.[0].body).toBe("newest text");
    expect(after.pages[0].messages?.[1].deletedAt).toBe("2026-03-10T10:06:00Z");
    expect(after.pages[0].messages?.[1].body).toBeUndefined();
  });
});

describe("markDeleted", () => {
  it("turns a Message into a placeholder: no text, a deletion time, everything else kept", () => {
    const after = markDeleted(history(page(5, 6)), "id6", "2026-03-10T10:06:00Z");

    expect(after.pages[0].messages?.[1]).toEqual({ ...msg(6), body: undefined, deletedAt: "2026-03-10T10:06:00Z" });
    expect(after.pages[0].messages?.[0]).toEqual(msg(5));
  });

  it("returns the same history when the Message is not loaded or is already deleted", () => {
    const before = history(page(5), { messages: [msg(6, { body: undefined, deletedAt: "2026-03-10T10:00:00Z" })], hasMore: false });

    expect(markDeleted(before, "nope", "2026-03-10T10:06:00Z")).toBe(before);
    expect(markDeleted(before, "id6", "2026-03-10T10:06:00Z")).toBe(before);
  });
});

describe("removeById", () => {
  it("takes the Message with this id out of the history", () => {
    expect(seqs(removeById(history(page(5, 6), page(3, 4)), "id4"))).toEqual([[5, 6], [3]]);
  });

  it("returns the same history when it is not there", () => {
    const before = history(page(5));
    expect(removeById(before, "nope")).toBe(before);
  });
});
