import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTypingTracker } from "./typing-tracker";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the typing tracker", () => {
  it("knows who is typing in a Conversation, in the order they started", () => {
    const tracker = createTypingTracker();
    tracker.started("c1", "ada");
    tracker.started("c1", "grace");
    tracker.started("c2", "linus");
    expect(tracker.typing("c1")).toEqual(["ada", "grace"]);
    expect(tracker.typing("c2")).toEqual(["linus"]);
    expect(tracker.typing("nobody")).toEqual([]);
  });

  it("forgets someone who stops", () => {
    const tracker = createTypingTracker();
    tracker.started("c1", "ada");
    tracker.started("c1", "grace");
    tracker.stopped("c1", "ada");
    expect(tracker.typing("c1")).toEqual(["grace"]);
    tracker.stopped("c1", "ada"); // nothing to forget
    expect(tracker.typing("c1")).toEqual(["grace"]);
  });

  it("forgets someone by itself when nothing more is heard for about six seconds", () => {
    const tracker = createTypingTracker();
    tracker.started("c1", "ada");
    vi.advanceTimersByTime(5_900);
    expect(tracker.typing("c1")).toEqual(["ada"]);
    vi.advanceTimersByTime(200);
    expect(tracker.typing("c1")).toEqual([]);
  });

  it("keeps someone who keeps being heard, and counts each person's time apart", () => {
    const tracker = createTypingTracker();
    tracker.started("c1", "ada"); // t = 0
    vi.advanceTimersByTime(4_000);
    tracker.started("c1", "grace"); // t = 4s
    vi.advanceTimersByTime(3_000);
    tracker.started("c1", "ada"); // t = 7s: heard again, so Ada's six seconds start over
    vi.advanceTimersByTime(3_100); // t = 10.1s
    expect(tracker.typing("c1"), "Grace was last heard 6.1s ago").toEqual(["ada"]);
    vi.advanceTimersByTime(3_000); // t = 13.1s
    expect(tracker.typing("c1")).toEqual([]);
  });

  it("tells subscribers about each change, including the quiet expiry, and gives the same list while nothing changed", () => {
    const tracker = createTypingTracker();
    let heard = 0;
    const stop = tracker.subscribe(() => heard++);

    tracker.started("c1", "ada");
    const first = tracker.typing("c1");
    expect(tracker.typing("c1")).toBe(first);
    tracker.started("c1", "ada"); // again: still just Ada
    expect(tracker.typing("c1")).toBe(first);
    vi.advanceTimersByTime(6_100);
    expect(heard).toBe(2); // started, expired
    stop();
    tracker.started("c1", "ada");
    expect(heard).toBe(2);
  });

  it("can be cleared (when the connection is lost nobody can be said to be typing)", () => {
    const tracker = createTypingTracker();
    tracker.started("c1", "ada");
    tracker.clear();
    expect(tracker.typing("c1")).toEqual([]);
    vi.advanceTimersByTime(10_000); // no stray timer
  });
});
