import { describe, expect, it } from "vitest";
import type { PresenceView } from "@/lib/api";
import { applyAvailability, applyPresence } from "./apply-presence";

const views: PresenceView[] = [
  { userId: "grace", online: false, lastSeenAt: "2026-03-10T09:00:00Z" },
  { userId: "linus", online: true },
];

describe("applyPresence", () => {
  it("shows someone as online, and forgets when they were last seen", () => {
    const result = applyPresence(views, { userId: "grace", online: true });
    expect(result?.[0]).toEqual({ userId: "grace", online: true, lastSeenAt: undefined });
    expect(result?.[1]).toBe(views[1]);
    expect(views[0].online, "the old list is not changed").toBe(false);
  });

  it("shows someone as offline with when they were last seen", () => {
    const result = applyPresence(views, { userId: "linus", online: false, lastSeenAt: "2026-03-10T10:30:00Z" });
    expect(result?.[1]).toEqual({ userId: "linus", online: false, lastSeenAt: "2026-03-10T10:30:00Z" });
  });

  it("changes nothing when the same thing is announced twice", () => {
    const once = applyPresence(views, { userId: "linus", online: false, lastSeenAt: "2026-03-10T10:30:00Z" })!;
    expect(applyPresence(once, { userId: "linus", online: false, lastSeenAt: "2026-03-10T10:30:00Z" })).toBe(once);
    expect(applyPresence(views, { userId: "linus", online: true })).toBe(views);
  });

  it("never moves a last-seen time backwards (a late announcement of an earlier disconnect)", () => {
    const result = applyPresence(views, { userId: "grace", online: false, lastSeenAt: "2026-03-10T08:00:00Z" });
    expect(result).toBe(views);
  });

  it("does nothing about someone who is not in the list, or when there is no list", () => {
    expect(applyPresence(views, { userId: "stranger", online: true })).toBe(views);
    expect(applyPresence(undefined, { userId: "grace", online: true })).toBeUndefined();
  });
});

describe("applyAvailability", () => {
  it("sets someone's Availability, leaving everyone else and the old list alone", () => {
    const result = applyAvailability(views, { userId: "grace", availability: "BUSY" });
    expect(result?.[0]).toEqual({ userId: "grace", online: false, lastSeenAt: "2026-03-10T09:00:00Z", availability: "BUSY" });
    expect(result?.[1]).toBe(views[1]);
    expect(views[0].availability, "the old list is not changed").toBeUndefined();
  });

  it("changes nothing when the value is the one already shown", () => {
    const busy = applyAvailability(views, { userId: "grace", availability: "BUSY" })!;
    expect(applyAvailability(busy, { userId: "grace", availability: "BUSY" })).toBe(busy);
  });

  it("does nothing about someone who is not in the list, or when there is no list", () => {
    expect(applyAvailability(views, { userId: "stranger", availability: "AWAY" })).toBe(views);
    expect(applyAvailability(undefined, { userId: "grace", availability: "AWAY" })).toBeUndefined();
  });
});
