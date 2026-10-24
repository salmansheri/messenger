import { describe, expect, it } from "vitest";
import type { BlockedUser } from "@/lib/api";
import { focusAfterRemoval, withoutBlockedUser } from "./blocked-users";

const grace: BlockedUser = { userId: "grace", displayName: "Grace Hopper", blockedAt: "2026-10-24T10:00:00Z" };
const linus: BlockedUser = { userId: "linus", displayName: "Linus Torvalds", blockedAt: "2026-10-24T09:00:00Z" };

describe("withoutBlockedUser", () => {
  it("takes the person out of the list, keeping the order of the rest", () => {
    expect(withoutBlockedUser([grace, linus], "grace")).toEqual([linus]);
  });

  it("gives back the same list when they are not in it, or there is no list", () => {
    const list = [grace, linus];
    expect(withoutBlockedUser(list, "ada")).toBe(list);
    expect(withoutBlockedUser(undefined, "grace")).toBeUndefined();
  });
});

describe("focusAfterRemoval", () => {
  it("moves on to the next person, or the one before when it was the last", () => {
    expect(focusAfterRemoval(["grace", "linus", "ada"], ["grace", "ada"], "linus")).toBe("ada");
    expect(focusAfterRemoval(["grace", "linus", "ada"], ["grace", "linus"], "ada")).toBe("linus");
  });

  it("skips people who left the list meanwhile (another tab unblocked them, or a second Unblock)", () => {
    expect(focusAfterRemoval(["grace", "linus", "ada", "alan"], ["grace", "alan"], "linus")).toBe("alan");
    expect(focusAfterRemoval(["grace", "linus", "ada"], ["grace"], "ada")).toBe("grace");
  });

  it("has nobody to go to when the list is now empty", () => {
    expect(focusAfterRemoval(["grace"], [], "grace")).toBeUndefined();
    expect(focusAfterRemoval(["grace", "linus"], [], "grace")).toBeUndefined();
  });
});
