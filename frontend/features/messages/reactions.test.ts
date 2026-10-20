import { describe, expect, it } from "vitest";
import type { ReactionView } from "@/lib/api";
import { acceptReaction, applyReaction, chipName, clearUser, myReaction, REACTIONS, reactionName } from "./reactions";

const THUMBS_UP = "👍";
const HEART = "❤️";
const LAUGH = "😂";

const view = (emoji: string, ...userIds: string[]): ReactionView => ({ emoji, userIds });

describe("the six reactions", () => {
  it("are offered in the backend's order, each with a name to say", () => {
    expect(REACTIONS.map((r) => r.name)).toEqual(["thumbs up", "heart", "laughing", "surprised", "sad", "folded hands"]);
    expect(reactionName(THUMBS_UP)).toBe("thumbs up");
    expect(reactionName(HEART)).toBe("heart");
  });

  it("have a name even for an emoji it does not know (a newer server), rather than none", () => {
    expect(reactionName("🦄")).toBe("reaction");
  });
});

describe("chipName", () => {
  it("says what pressing it does and how many chose it", () => {
    expect(chipName(view(THUMBS_UP, "a", "b"))).toBe("React with thumbs up (2)");
    expect(chipName(view(HEART, "a"))).toBe("React with heart (1)");
  });
});

describe("myReaction", () => {
  it("is the emoji the person chose, or nothing", () => {
    const reactions = [view(THUMBS_UP, "a", "me"), view(HEART, "b")];

    expect(myReaction(reactions, "me")).toBe(THUMBS_UP);
    expect(myReaction(reactions, "c")).toBeUndefined();
    expect(myReaction(undefined, "me")).toBeUndefined();
    expect(myReaction(reactions, undefined)).toBeUndefined();
  });
});

describe("applyReaction", () => {
  it("adds a person under their emoji, after the people who chose it earlier", () => {
    expect(applyReaction([view(THUMBS_UP, "a")], "b", THUMBS_UP)).toEqual([view(THUMBS_UP, "a", "b")]);
  });

  it("starts a group for a new emoji and keeps the emoji in the offered order", () => {
    const result = applyReaction([view(LAUGH, "a")], "b", THUMBS_UP);

    expect(result.map((r) => r.emoji)).toEqual([THUMBS_UP, LAUGH]);
  });

  it("moves a person who changes their mind, and drops a group that is left empty", () => {
    expect(applyReaction([view(THUMBS_UP, "me")], "me", HEART)).toEqual([view(HEART, "me")]);
    expect(applyReaction([view(THUMBS_UP, "me", "a")], "me", HEART)).toEqual([view(THUMBS_UP, "a"), view(HEART, "me")]);
  });

  it("takes a person away when they remove their reaction", () => {
    expect(applyReaction([view(THUMBS_UP, "me")], "me", null)).toEqual([]);
    expect(applyReaction(undefined, "me", null)).toEqual([]);
  });

  it("changes nothing when the person already has that reaction", () => {
    const reactions = [view(THUMBS_UP, "me")];

    expect(applyReaction(reactions, "me", THUMBS_UP)).toBe(reactions);
  });
});

describe("clearUser", () => {
  it("takes a person out of every reaction", () => {
    expect(clearUser([view(THUMBS_UP, "me", "a"), view(HEART, "me")], "me")).toEqual([view(THUMBS_UP, "a")]);
  });

  it("returns the same list when they had not reacted", () => {
    const reactions = [view(THUMBS_UP, "a")];

    expect(clearUser(reactions, "me")).toBe(reactions);
  });
});

describe("acceptReaction", () => {
  const event = (at: string, userId = "a", messageId = "m1") => ({ messageId, userId, at });

  it("takes the first word about a person's reaction to a Message", () => {
    expect(acceptReaction({}, event("2026-03-10T10:00:00Z"))).toEqual({
      accepted: true,
      times: { "m1:a": "2026-03-10T10:00:00Z" },
    });
  });

  it("takes a later word and refuses an earlier or repeated one, however they arrive", () => {
    const known = { "m1:a": "2026-03-10T10:05:00Z" };

    expect(acceptReaction(known, event("2026-03-10T10:09:00Z")).accepted).toBe(true);
    expect(acceptReaction(known, event("2026-03-10T10:00:00Z"))).toEqual({ accepted: false, times: known });
    expect(acceptReaction(known, event("2026-03-10T10:05:00Z")).accepted).toBe(false);
  });

  it("keeps each person and each Message apart", () => {
    const known = { "m1:a": "2026-03-10T10:05:00Z" };

    expect(acceptReaction(known, event("2026-03-10T10:00:00Z", "b")).accepted).toBe(true);
    expect(acceptReaction(known, event("2026-03-10T10:00:00Z", "a", "m2")).accepted).toBe(true);
  });

  it("compares moments, not text (the server's fractions of a second differ in length)", () => {
    const known = { "m1:a": "2026-03-10T10:05:00.5Z" };

    expect(acceptReaction(known, event("2026-03-10T10:05:00.123456Z")).accepted).toBe(false);
    expect(acceptReaction(known, event("2026-03-10T10:05:00.9Z")).accepted).toBe(true);
  });
});
