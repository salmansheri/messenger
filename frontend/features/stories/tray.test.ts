import { describe, expect, it } from "vitest";
import type { Person, StoryResponse, StoryTray } from "@/lib/api";
import { applyStoryEvent, markSeen, orderTray, trayEntryLabel, viewerPeople } from "./tray";

const story = (id: string, posterId: string, createdAt: string, extra: Partial<StoryResponse> = {}): StoryResponse => ({
  id,
  posterId,
  kind: "TEXT",
  text: id,
  tone: "SEA",
  createdAt,
  seen: false,
  ...extra,
});

const person = (userId: string, stories: StoryResponse[]): Person => ({ userId, displayName: userId, stories });

const ME = { id: "me", displayName: "Me" };

describe("orderTray", () => {
  it("puts your own first, then people with unseen Stories newest first, then people seen, newest first", () => {
    const tray: StoryTray = {
      own: [story("m1", "me", "2026-03-10T08:00:00Z", { seen: true })],
      people: [
        person("seenRecently", [story("s1", "seenRecently", "2026-03-10T11:00:00Z", { seen: true })]),
        person("unseenOld", [story("u1", "unseenOld", "2026-03-10T07:00:00Z")]),
        person("seenOld", [story("s2", "seenOld", "2026-03-10T06:00:00Z", { seen: true })]),
        person("unseenNew", [
          story("u2", "unseenNew", "2026-03-10T05:00:00Z", { seen: true }),
          story("u3", "unseenNew", "2026-03-10T10:00:00Z"),
        ]),
      ],
    };

    const entries = orderTray(tray, ME);

    expect(entries.map((entry) => entry.userId)).toEqual(["me", "unseenNew", "unseenOld", "seenRecently", "seenOld"]);
    expect(entries[0]).toMatchObject({ own: true, displayName: "Me", unseen: false });
    expect(entries[1]).toMatchObject({ own: false, unseen: true });
    expect(entries[3]).toMatchObject({ unseen: false });
  });

  it("has no own entry without own Stories, and nothing at all when nobody has a Story", () => {
    expect(orderTray({ own: [], people: [person("ada", [story("a1", "ada", "2026-03-10T08:00:00Z")])] }, ME).map((e) => e.userId)).toEqual(["ada"]);
    expect(orderTray({ own: [], people: [] }, ME)).toEqual([]);
    expect(orderTray(undefined, ME)).toEqual([]);
  });

  it("leaves out a person whose Stories have all gone", () => {
    expect(orderTray({ people: [person("ada", [])] }, ME)).toEqual([]);
  });
});

describe("trayEntryLabel", () => {
  it("names the person and whether they have unseen Stories", () => {
    expect(trayEntryLabel({ own: false, displayName: "Grace Hopper", unseen: true })).toBe("Grace Hopper, unseen Stories");
    expect(trayEntryLabel({ own: false, displayName: "Grace Hopper", unseen: false })).toBe("Grace Hopper, Stories seen");
    expect(trayEntryLabel({ own: true, displayName: "Me", unseen: false })).toBe("Your Story");
  });
});

describe("applyStoryEvent", () => {
  const tray: StoryTray = {
    own: [story("m1", "me", "2026-03-10T08:00:00Z", { seen: true, viewCount: 1 })],
    people: [person("ada", [story("a1", "ada", "2026-03-10T08:00:00Z")])],
  };

  it("adds a Story someone posted to their entry, and a new person for someone not yet in the tray", () => {
    const later = story("a2", "ada", "2026-03-10T09:00:00Z");
    const withAda = applyStoryEvent(tray, { type: "story.posted", story: later, poster: { userId: "ada", displayName: "Ada" } }, "me");
    expect(withAda.people?.[0].stories?.map((s) => s.id)).toEqual(["a1", "a2"]);

    const grace = story("g1", "grace", "2026-03-10T09:00:00Z");
    const withGrace = applyStoryEvent(tray, { type: "story.posted", story: grace, poster: { userId: "grace", displayName: "Grace", avatarUrl: "x" } }, "me");
    expect(withGrace.people?.find((p) => p.userId === "grace")).toEqual({ userId: "grace", displayName: "Grace", avatarUrl: "x", stories: [grace] });
  });

  it("adds your own Story from another tab to your own, and ignores one already there", () => {
    const mine = story("m2", "me", "2026-03-10T09:00:00Z", { seen: true, viewCount: 0 });
    const next = applyStoryEvent(tray, { type: "story.posted", story: mine, poster: { userId: "me", displayName: "Me" } }, "me");
    expect(next.own?.map((s) => s.id)).toEqual(["m1", "m2"]);
    expect(applyStoryEvent(next, { type: "story.posted", story: mine, poster: { userId: "me", displayName: "Me" } }, "me")).toBe(next);
  });

  it("removes a Story, and the person with their last one", () => {
    const next = applyStoryEvent(tray, { type: "story.removed", storyId: "a1", posterId: "ada" }, "me");
    expect(next.people).toEqual([]);
    expect(applyStoryEvent(tray, { type: "story.removed", storyId: "m1", posterId: "me" }, "me").own).toEqual([]);
    expect(applyStoryEvent(tray, { type: "story.removed", storyId: "nope", posterId: "ada" }, "me")).toBe(tray);
  });

  it("raises the view count of your own Story, never lowering it", () => {
    const viewed = applyStoryEvent(tray, { type: "story.viewed", storyId: "m1", viewerId: "ada", viewedAt: "t", viewCount: 3 }, "me");
    expect(viewed.own?.[0].viewCount).toBe(3);
    expect(applyStoryEvent(viewed, { type: "story.viewed", storyId: "m1", viewerId: "x", viewedAt: "t", viewCount: 2 }, "me")).toBe(viewed);
    expect(applyStoryEvent(tray, { type: "story.viewed", storyId: "nope", viewerId: "x", viewedAt: "t", viewCount: 9 }, "me")).toBe(tray);
  });
});

describe("markSeen", () => {
  it("marks one Story seen, leaving the tray as it was when it already is or is unknown", () => {
    const tray: StoryTray = { own: [], people: [person("ada", [story("a1", "ada", "t"), story("a2", "ada", "t")])] };
    const next = markSeen(tray, "a1");
    expect(next.people?.[0].stories?.map((s) => s.seen)).toEqual([true, false]);
    expect(markSeen(next, "a1")).toBe(next);
    expect(markSeen(tray, "nope")).toBe(tray);
  });
});

describe("viewerPeople", () => {
  it("is the ordered entries as the viewer plays them, with own Stories counted as seen and photos marked", () => {
    const entries = orderTray(
      { own: [story("m1", "me", "t", { seen: true })], people: [person("ada", [story("a1", "ada", "t", { kind: "PHOTO" })])] },
      ME,
    );
    expect(viewerPeople(entries)).toEqual([
      { userId: "me", stories: [{ id: "m1", photo: false, seen: true }] },
      { userId: "ada", stories: [{ id: "a1", photo: true, seen: false }] },
    ]);
  });
});
