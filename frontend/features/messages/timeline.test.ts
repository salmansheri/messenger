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
      myId: "me",
      confirmed: [msg(1, "a", "2026-03-10T10:00:00Z"), { ...msg(2, "me", "2026-03-10T11:00:00Z"), clientMessageId: "done" }],
      pending: [pending("done", "already stored"), pending("new", "on its way"), pending("bad", "oops", "failed")],
    });
    const messages = items.filter((i) => i.kind === "message");
    expect(messages.map((i) => i.body)).toEqual(["m1", "m2", "on its way", "oops"]);
    expect(messages.map((i) => i.pending?.status)).toEqual([undefined, undefined, "sending", "failed"]);
    expect(messages.at(-1)?.key).toBe("pending-bad");
    expect(messages.map((i) => i.mine)).toEqual([false, true, true, true]);
  });
});

describe("edited and deleted Messages in the timeline", () => {
  it("carries the id and whether a Message was edited or deleted, and shows a deleted one with no text", () => {
    const edited: MessageResponse = { ...msg(1, "a", "2026-03-10T10:00:00Z", "fixed"), editedAt: "2026-03-10T10:05:00Z" };
    const deleted: MessageResponse = { id: "id2", seq: 2, senderId: "a", createdAt: "2026-03-10T10:01:00Z", deletedAt: "2026-03-10T10:06:00Z" };

    const items = build({ confirmed: [edited, deleted, msg(3, "a", "2026-03-10T10:02:00Z")], myId: "a" });
    const messages = items.filter((item) => item.kind === "message");

    expect(messages.map((m) => [m.messageId, m.edited, m.deleted, m.body])).toEqual([
      ["id1", true, false, "fixed"],
      ["id2", false, true, ""],
      ["id3", false, false, "m3"],
    ]);
  });

  it("has no id, and is neither edited nor deleted, while a Message is still being sent", () => {
    const [message] = build({ pending: [pending("x", "Sending now")], myId: "a" }).filter((item) => item.kind === "message");

    expect([message.messageId, message.edited, message.deleted]).toEqual([undefined, false, false]);
  });
});

describe("reactions in the timeline", () => {
  it("carries a Message's reactions, none for one still being sent, and none for a deleted one", () => {
    const reacted: MessageResponse = { ...msg(1, "a", "2026-03-10T10:00:00Z"), reactions: [{ emoji: "x", userIds: ["b"] }] };
    const deleted: MessageResponse = {
      id: "id2",
      seq: 2,
      senderId: "a",
      createdAt: "2026-03-10T10:01:00Z",
      deletedAt: "2026-03-10T10:06:00Z",
      reactions: [{ emoji: "x", userIds: ["b"] }],
    };

    const messages = build({ confirmed: [reacted, deleted], pending: [pending("p", "Sending")], myId: "a" }).filter(
      (item) => item.kind === "message",
    );

    expect(messages.map((m) => m.reactions)).toEqual([[{ emoji: "x", userIds: ["b"] }], [], []]);
  });
});

describe("replies in the timeline", () => {
  const quote = { messageId: "q1", senderId: "a", text: "Are you free?", deleted: false, unavailable: false };

  it("carries the quote of a reply, of one still being sent, and none for a Message that answers nothing or was deleted", () => {
    const reply: MessageResponse = { ...msg(1, "a", "2026-03-10T10:00:00Z"), replyTo: quote };
    const plain = msg(2, "a", "2026-03-10T10:01:00Z");
    const deletedReply: MessageResponse = {
      id: "id3",
      seq: 3,
      senderId: "a",
      createdAt: "2026-03-10T10:02:00Z",
      deletedAt: "2026-03-10T10:06:00Z",
      replyTo: quote,
    };
    const sending: Pending = { ...pending("p", "On its way"), replyTo: quote };

    const messages = build({ confirmed: [reply, plain, deletedReply], pending: [sending], myId: "a" }).filter(
      (item) => item.kind === "message",
    );

    expect(messages.map((m) => m.replyTo)).toEqual([quote, undefined, undefined, quote]);
  });
});

describe("images in the timeline", () => {
  const picture = { id: "a1", width: 64, height: 48, url: "https://files/full", thumbnailUrl: "https://files/thumb" };

  it("shows the thumbnail the server made, with its size so the space is reserved, and an empty text for an image sent alone", () => {
    const items = build({ confirmed: [{ ...msg(1, "a", "2026-03-10T10:00:00Z"), body: undefined, attachment: picture }] });

    const message = items.find((item) => item.kind === "message");
    expect(message).toMatchObject({ body: "", image: { src: "https://files/thumb", fullSrc: "https://files/full", width: 64, height: 48 } });
  });

  it("keeps the caption beside the image", () => {
    const items = build({ confirmed: [{ ...msg(1, "a", "2026-03-10T10:00:00Z", "Lunch"), attachment: picture }] });

    expect(items.find((item) => item.kind === "message")).toMatchObject({ body: "Lunch", image: { src: "https://files/thumb" } });
  });

  it("shows no image for a deleted Message, and none for a plain one", () => {
    const deleted = { ...msg(1, "a", "2026-03-10T10:00:00Z"), body: undefined, deletedAt: "2026-03-10T10:05:00Z", attachment: picture };
    const plain = msg(2, "a", "2026-03-10T10:06:00Z");

    const messages = build({ confirmed: [deleted, plain] }).filter((item) => item.kind === "message");
    expect(messages.map((item) => item.kind === "message" && item.image)).toEqual([undefined, undefined]);
  });

  it("shows a Message still being sent with the preview chosen on this device", () => {
    const sending: Pending = {
      ...pending("p1", ""),
      image: { file: new File(["x"], "a.png"), previewUrl: "blob:local", width: 10, height: 20 },
    };

    const item = build({ pending: [sending], myId: "me" }).find((entry) => entry.kind === "message");
    expect(item).toMatchObject({ image: { src: "blob:local", width: 10, height: 20 }, body: "" });
  });
});

