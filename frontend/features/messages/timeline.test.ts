import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import type { Pending } from "./outbox";
import { buildTimeline, confirmedMessages, firstUnreadSeq } from "./timeline";

const UTC = "UTC";
const NOW = new Date("2026-03-10T12:00:00Z");

const msg = (seq: number, senderId: string, createdAt: string, body = `m${seq}`): MessageResponse => ({
  id: `id${seq}`,
  seq,
  senderId,
  body,
  createdAt,
  clientMessageId: `c${seq}`,
});

const pending = (id: string, body: string, status: Pending["status"] = "sending"): Pending => ({
  clientMessageId: id,
  body,
  status,
  createdAt: "2026-03-10T11:59:00Z",
});

const build = (overrides: Partial<Parameters<typeof buildTimeline>[0]> = {}) =>
  buildTimeline({ confirmed: [], pending: [], firstUnreadSeq: undefined, now: NOW, timeZone: UTC, ...overrides });

describe("confirmedMessages", () => {
  it("joins pages of history into one list in seq order, once each", () => {
    const newest = { messages: [msg(3, "a", "2026-03-10T10:00:00Z"), msg(4, "a", "2026-03-10T10:01:00Z")], hasMore: true };
    const older = { messages: [msg(1, "a", "2026-03-10T09:00:00Z"), msg(3, "a", "2026-03-10T10:00:00Z")], hasMore: false };
    expect(confirmedMessages([newest, older]).map((m) => m.seq)).toEqual([1, 3, 4]);
  });
});

describe("firstUnreadSeq", () => {
  it("is the Message after the last one read, worked out from the unread count", () => {
    expect(firstUnreadSeq({ unreadCount: 3, lastMessage: { seq: 10 } })).toBe(8);
  });
  it("is nothing when the person is caught up or nothing was sent", () => {
    expect(firstUnreadSeq({ unreadCount: 0, lastMessage: { seq: 10 } })).toBeUndefined();
    expect(firstUnreadSeq({ unreadCount: 2, lastMessage: undefined })).toBeUndefined();
    expect(firstUnreadSeq({})).toBeUndefined();
  });
});

describe("buildTimeline", () => {
  it("puts a day separator before each day, labelled Today and Yesterday near now", () => {
    const items = build({
      confirmed: [
        msg(1, "a", "2026-03-08T10:00:00Z"),
        msg(2, "a", "2026-03-09T23:30:00Z"),
        msg(3, "a", "2026-03-10T00:30:00Z"),
      ],
    });
    expect(items.filter((i) => i.kind === "day").map((i) => i.label)).toEqual(["Sun 8 Mar", "Yesterday", "Today"]);
    expect(items.map((i) => i.kind)).toEqual(["day", "message", "day", "message", "day", "message"]);
  });

  it("names the sender once per run of Messages from the same person", () => {
    const items = build({
      confirmed: [
        msg(1, "a", "2026-03-10T10:00:00Z"),
        msg(2, "a", "2026-03-10T10:01:00Z"),
        msg(3, "b", "2026-03-10T10:02:00Z"),
        msg(4, "a", "2026-03-10T10:03:00Z"),
      ],
    });
    const runs = items.filter((i) => i.kind === "message").map((i) => i.startsRun);
    expect(runs).toEqual([true, false, true, true]);
  });

  it("starts a new run after a day separator even for the same sender", () => {
    const items = build({
      confirmed: [msg(1, "a", "2026-03-09T23:59:00Z"), msg(2, "a", "2026-03-10T00:01:00Z")],
    });
    expect(items.filter((i) => i.kind === "message").map((i) => i.startsRun)).toEqual([true, true]);
  });

  it("marks the first unread Message, and starts a run there", () => {
    const items = build({
      confirmed: [msg(1, "a", "2026-03-10T10:00:00Z"), msg(2, "a", "2026-03-10T10:01:00Z")],
      firstUnreadSeq: 2,
    });
    expect(items.map((i) => i.kind)).toEqual(["day", "message", "unread", "message"]);
    const second = items[3];
    expect(second.kind === "message" && second.startsRun).toBe(true);
  });

  it("shows no unread mark when the first unread Message is not loaded", () => {
    const items = build({ confirmed: [msg(5, "a", "2026-03-10T10:00:00Z")], firstUnreadSeq: 2 });
    expect(items.some((i) => i.kind === "unread")).toBe(false);
  });

  it("puts Messages being sent last, as the sender's own, and hides one the server already confirmed", () => {
    const items = build({
      confirmed: [msg(1, "a", "2026-03-10T10:00:00Z"), { ...msg(2, "me", "2026-03-10T11:00:00Z"), clientMessageId: "done" }],
      pending: [pending("done", "already stored"), pending("new", "on its way"), pending("bad", "oops", "failed")],
    });
    const messages = items.filter((i) => i.kind === "message");
    expect(messages.map((i) => i.body)).toEqual(["m1", "m2", "on its way", "oops"]);
    expect(messages.map((i) => i.pending?.status)).toEqual([undefined, undefined, "sending", "failed"]);
    expect(messages.at(-1)?.key).toBe("pending-bad");
  });
});
