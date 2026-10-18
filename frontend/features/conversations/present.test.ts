import { describe, expect, it } from "vitest";
import type { ConversationResponse } from "@/lib/api";
import { conversationTitle, formatWhen, lastLine, unreadLabel } from "./present";

const ME = "me-id";

const direct = (overrides: Partial<ConversationResponse> = {}): ConversationResponse => ({
  id: "c1",
  type: "DIRECT",
  participants: [
    { userId: ME, displayName: "Me Myself", role: "MEMBER" },
    { userId: "grace-id", displayName: "Grace Hopper", role: "MEMBER" },
  ],
  unreadCount: 0,
  ...overrides,
});

describe("conversationTitle", () => {
  it("names a Direct conversation after the other person", () => {
    expect(conversationTitle(direct(), ME)).toBe("Grace Hopper");
    expect(
      conversationTitle(direct({ participants: [{ userId: "grace-id", displayName: "Grace Hopper" }, { userId: ME, displayName: "Me" }] }), ME),
    ).toBe("Grace Hopper");
  });

  it("names a Group after its name", () => {
    expect(conversationTitle({ id: "g", type: "GROUP", name: "Analytical Engine", participants: [] }, ME)).toBe(
      "Analytical Engine",
    );
  });

  it("still has something to show when the names are missing", () => {
    expect(conversationTitle({ id: "x", type: "DIRECT", participants: [{ userId: ME, displayName: "Me" }] }, ME)).toBe(
      "Conversation",
    );
    expect(conversationTitle({ id: "g", type: "GROUP", participants: [] }, ME)).toBe("Group");
  });
});

describe("lastLine", () => {
  it("says so when nothing has been sent yet", () => {
    expect(lastLine(direct(), ME)).toBe("No messages yet");
  });

  it("shows the latest Message on one line", () => {
    const c = direct({ lastMessage: { senderId: "grace-id", body: "See you\n  at   nine" } });
    expect(lastLine(c, ME)).toBe("See you at nine");
  });

  it("marks the viewer's own Message", () => {
    const c = direct({ lastMessage: { senderId: ME, body: "On my way" } });
    expect(lastLine(c, ME)).toBe("You: On my way");
  });

  it("names the sender in a Group", () => {
    const group: ConversationResponse = {
      id: "g",
      type: "GROUP",
      name: "Trio",
      participants: [
        { userId: ME, displayName: "Me" },
        { userId: "ada-id", displayName: "Ada Lovelace" },
      ],
      lastMessage: { senderId: "ada-id", body: "Notes attached" },
    };
    expect(lastLine(group, ME)).toBe("Ada Lovelace: Notes attached");
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-10-19T15:30:00Z");
  const when = (iso: string) => formatWhen(iso, now, "UTC");

  it("shows the time for today", () => {
    expect(when("2026-10-19T09:05:00Z")).toBe("09:05");
  });

  it("says Yesterday for the day before", () => {
    expect(when("2026-10-18T23:59:00Z")).toBe("Yesterday");
  });

  it("shows the weekday for the rest of the past week", () => {
    expect(when("2026-10-15T10:00:00Z")).toBe("Thu");
  });

  it("shows the date for anything older, with the year only when it is another year", () => {
    expect(when("2026-09-30T10:00:00Z")).toBe("30 Sept");
    expect(when("2025-12-24T10:00:00Z")).toBe("24 Dec 2025");
  });

  it("judges days in the given time zone", () => {
    // 14:30 UTC is today in UTC, but in Tokyo it is 23:30 and "now" (15:30 UTC) is already 00:30 the next day
    expect(formatWhen("2026-10-19T14:30:00Z", now, "UTC")).toBe("14:30");
    expect(formatWhen("2026-10-19T14:30:00Z", now, "Asia/Tokyo")).toBe("Yesterday");
  });

  it("is empty for a missing or unreadable time", () => {
    expect(formatWhen(undefined, now, "UTC")).toBe("");
    expect(formatWhen("not a date", now, "UTC")).toBe("");
  });
});

describe("unreadLabel", () => {
  it("shows nothing for no unread Messages and caps a long count", () => {
    expect(unreadLabel(0)).toBeUndefined();
    expect(unreadLabel(undefined)).toBeUndefined();
    expect(unreadLabel(7)).toBe("7");
    expect(unreadLabel(99)).toBe("99");
    expect(unreadLabel(100)).toBe("99+");
  });
});
