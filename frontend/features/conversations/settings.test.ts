import { describe, expect, it } from "vitest";
import type { ConversationResponse, ConversationSettings } from "@/lib/api";
import { archivedHasUnread, isMuted, orderConversations, withSettings } from "./settings";

const NOW = new Date("2026-03-10T12:00:00Z");

const c = (id: string, updatedAt: string, settings: ConversationSettings = {}, unreadCount = 0): ConversationResponse => ({
  id,
  type: "DIRECT",
  updatedAt,
  unreadCount,
  settings: { muted: false, archived: false, pinned: false, ...settings },
});

describe("isMuted", () => {
  it("is muted for ever without an end, and until the end when there is one", () => {
    expect(isMuted({ muted: true }, NOW)).toBe(true);
    expect(isMuted({ muted: true, mutedUntil: "2026-03-10T13:00:00Z" }, NOW)).toBe(true);
  });

  it("is no longer muted once the end has passed, even if the list was fetched before that", () => {
    expect(isMuted({ muted: true, mutedUntil: "2026-03-10T11:59:59Z" }, NOW)).toBe(false);
  });

  it("is not muted when the server did not say so, or said nothing", () => {
    expect(isMuted({ muted: false }, NOW)).toBe(false);
    expect(isMuted(undefined, NOW)).toBe(false);
  });
});

describe("orderConversations", () => {
  it("puts pinned Conversations first and then goes by recent activity, whichever order they came in", () => {
    const list = [
      c("old", "2026-03-10T08:00:00Z"),
      c("pinned-old", "2026-03-09T08:00:00Z", { pinned: true }),
      c("new", "2026-03-10T11:00:00Z"),
      c("pinned-new", "2026-03-10T10:00:00Z", { pinned: true }),
    ];

    expect(orderConversations(list).map((x) => x.id)).toEqual(["pinned-new", "pinned-old", "new", "old"]);
  });

  it("puts a Conversation with no activity time after the others, wherever it was, so the order is always the same", () => {
    const noTime: ConversationResponse = { id: "none", type: "DIRECT", settings: { pinned: false } };
    const list = [c("a", "2026-03-09T08:00:00Z"), noTime, c("b", "2026-03-10T08:00:00Z")];

    expect(orderConversations(list).map((x) => x.id)).toEqual(["b", "a", "none"]);
    expect(orderConversations([...list].reverse()).map((x) => x.id)).toEqual(["b", "a", "none"]);
  });

  it("keeps the order it was given where nothing tells two apart", () => {
    const list = [c("a", "2026-03-10T08:00:00Z"), c("b", "2026-03-10T08:00:00Z")];

    expect(orderConversations(list).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("does not change the list it is given", () => {
    const list = [c("a", "2026-03-09T08:00:00Z"), c("b", "2026-03-10T08:00:00Z")];

    orderConversations(list);

    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("withSettings", () => {
  const list = [c("a", "2026-03-10T11:00:00Z"), c("b", "2026-03-10T09:00:00Z")];

  it("replaces one Conversation's settings and moves it where they put it", () => {
    const result = withSettings(list, "b", { muted: false, archived: false, pinned: true });

    expect(result?.map((x) => x.id)).toEqual(["b", "a"]);
    expect(result?.[0].settings?.pinned).toBe(true);
  });

  it("puts a Conversation back by activity when it is unpinned", () => {
    const pinned = [c("b", "2026-03-10T09:00:00Z", { pinned: true }), c("a", "2026-03-10T11:00:00Z")];

    expect(withSettings(pinned, "b", { muted: false, archived: false, pinned: false })?.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("changes nothing when the settings are the same already", () => {
    expect(withSettings(list, "a", { muted: false, archived: false, pinned: false })).toBe(list);
  });

  it("says it does not know the Conversation", () => {
    expect(withSettings(list, "nope", { pinned: true })).toBeUndefined();
  });
});

describe("archivedHasUnread", () => {
  it("is true when an archived Conversation has unread Messages", () => {
    expect(archivedHasUnread([c("a", "x", { archived: true }, 2), c("b", "x", {}, 5)])).toBe(true);
  });

  it("is false when the archived ones are all read, or nothing is archived", () => {
    expect(archivedHasUnread([c("a", "x", { archived: true }, 0), c("b", "x", {}, 5)])).toBe(false);
    expect(archivedHasUnread([])).toBe(false);
  });
});
