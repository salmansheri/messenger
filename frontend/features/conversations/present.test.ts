import { describe, expect, it } from "vitest";
import type { ConversationResponse } from "@/lib/api";
import {
  conversationAvatar,
  conversationTitle,
  formatClock,
  formatDay,
  formatWhen,
  lastLine,
  otherParticipantId,
  settingsLine,
  unreadLabel,
  unreadSpeech,
} from "./present";

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
  it("says a Message answers a Story, from either side", () => {
    const storyQuote = { storyId: "s1", kind: "TEXT" as const, text: "Off to the coast", unavailable: false };
    expect(lastLine(direct({ lastMessage: { senderId: "grace-id", body: "Lucky you!", storyQuote } }), ME)).toBe("Replied to your Story: Lucky you!");
    expect(lastLine(direct({ lastMessage: { senderId: ME, body: "Lucky you!", storyQuote } }), ME)).toBe("You replied to a Story: Lucky you!");
    expect(lastLine(direct({ lastMessage: { senderId: ME, body: "Gone", storyQuote: { unavailable: true } } }), ME)).toBe("You replied to a Story: Gone");
  });

  it("says so when nothing has been sent yet", () => {
    expect(lastLine(direct(), ME)).toBe("No Messages yet");
  });

  it("shows the latest Message on one line", () => {
    const c = direct({ lastMessage: { senderId: "grace-id", body: "See you\n  at   nine" } });
    expect(lastLine(c, ME)).toBe("See you at nine");
  });

  it("says a deleted Message was deleted, whoever sent it, rather than that nothing was sent", () => {
    const deletedAt = "2026-03-10T10:06:00Z";
    expect(lastLine(direct({ lastMessage: { senderId: ME, deletedAt } }), ME)).toBe("This Message was deleted");
    expect(lastLine(direct({ lastMessage: { senderId: "grace-id", deletedAt } }), ME)).toBe("This Message was deleted");
  });

  it("says Photo for an image sent alone, and Photo with the caption when it has one", () => {
    const attachment = { id: "a1", width: 4, height: 3, url: "u", thumbnailUrl: "t" };
    expect(lastLine(direct({ lastMessage: { senderId: "grace-id", attachment } }), ME)).toBe("Photo");
    expect(lastLine(direct({ lastMessage: { senderId: "grace-id", body: "Lunch today", attachment } }), ME)).toBe("Photo: Lunch today");
    expect(lastLine(direct({ lastMessage: { senderId: ME, attachment } }), ME)).toBe("You: Photo");
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

describe("unreadSpeech", () => {
  it("says it in words for a screen reader, in the singular for one", () => {
    expect(unreadSpeech(0)).toBeUndefined();
    expect(unreadSpeech(undefined)).toBeUndefined();
    expect(unreadSpeech(1)).toBe("1 unread Message");
    expect(unreadSpeech(2)).toBe("2 unread Messages");
    expect(unreadSpeech(99)).toBe("99 unread Messages");
    expect(unreadSpeech(100)).toBe("More than 99 unread Messages");
  });
});

describe("otherParticipantId", () => {
  it("is the Participant who is not you", () => {
    expect(otherParticipantId(direct(), ME)).toBe("grace-id");
    expect(otherParticipantId(direct(), "grace-id")).toBe(ME);
  });
  it("is nothing when there is nobody else", () => {
    expect(otherParticipantId(direct({ participants: [] }), ME)).toBeUndefined();
    expect(otherParticipantId(direct({ participants: undefined }), ME)).toBeUndefined();
  });
});

describe("formatDay", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  it("says Today and Yesterday, then the weekday and date, with the year only when it is not this year", () => {
    expect(formatDay("2026-03-10T00:10:00Z", now, "UTC")).toBe("Today");
    expect(formatDay("2026-03-09T23:59:00Z", now, "UTC")).toBe("Yesterday");
    expect(formatDay("2026-03-01T10:00:00Z", now, "UTC")).toBe("Sun 1 Mar");
    expect(formatDay("2025-12-24T10:00:00Z", now, "UTC")).toBe("Wed 24 Dec 2025");
  });
  it("uses the viewer's days", () => {
    expect(formatDay("2026-03-09T23:30:00Z", now, "Asia/Kolkata")).toBe("Today"); // 05:00 on the 10th there
  });
});

describe("formatClock", () => {
  it("is the 24-hour time in the viewer's zone", () => {
    expect(formatClock("2026-03-10T09:05:00Z", "UTC")).toBe("09:05");
    expect(formatClock("2026-03-10T09:05:00Z", "Asia/Kolkata")).toBe("14:35");
    expect(formatClock(undefined, "UTC")).toBe("");
  });
});

describe("settingsLine", () => {
  const NOW = new Date("2026-03-10T12:00:00Z");
  const line = (settings: Parameters<typeof settingsLine>[0]) => settingsLine(settings, NOW, "UTC");

  it("says nothing when nothing is set", () => {
    expect(line({ muted: false, archived: false, pinned: false })).toBe("");
    expect(line(undefined)).toBe("");
  });

  it("says muted for ever, or until when", () => {
    expect(line({ muted: true })).toBe("Muted");
    expect(line({ muted: true, mutedUntil: "2026-03-10T20:00:00Z" })).toBe("Muted until 20:00");
    expect(line({ muted: true, mutedUntil: "2026-03-11T08:30:00Z" })).toBe("Muted until tomorrow 08:30");
    expect(line({ muted: true, mutedUntil: "2026-03-17T08:30:00Z" })).toBe("Muted until Tue 17 Mar, 08:30");
  });

  it("leaves a mute that has run out unsaid", () => {
    expect(line({ muted: true, mutedUntil: "2026-03-10T11:00:00Z" })).toBe("");
  });

  it("joins what is set, naming pinned and archived", () => {
    expect(line({ muted: true, archived: true })).toBe("Muted · Archived");
    expect(line({ muted: false, pinned: true })).toBe("Pinned");
    expect(line({ muted: true, mutedUntil: "2026-03-10T20:00:00Z", pinned: true })).toBe("Pinned · Muted until 20:00");
  });
});

describe("conversationAvatar", () => {
  it("shows the other person in a Direct conversation, with their picture when they have one", () => {
    const url = "http://files/avatars/grace-id/a.png?expires=1&signature=x";
    const withPicture = direct({
      participants: [
        { userId: ME, displayName: "Me Myself", role: "MEMBER", avatarUrl: "http://files/mine.png" },
        { userId: "grace-id", displayName: "Grace Hopper", role: "MEMBER", avatarUrl: url },
      ],
    });
    expect(conversationAvatar(withPicture, ME)).toEqual({ id: "grace-id", name: "Grace Hopper", url });
    expect(conversationAvatar(direct(), ME)).toEqual({ id: "grace-id", name: "Grace Hopper", url: undefined });
  });

  it("shows a Group by its name, which has no picture", () => {
    const group = direct({ id: "g1", type: "GROUP", name: "Analytical Engine" });
    expect(conversationAvatar(group, ME)).toEqual({ id: "g1", name: "Analytical Engine", url: undefined });
  });
});
