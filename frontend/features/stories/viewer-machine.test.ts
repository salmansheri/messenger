import { describe, expect, it } from "vitest";
import { STORY_MS, current, openViewer, step, type ViewerPerson } from "./viewer-machine";

const text = (id: string, seen = false) => ({ id, photo: false, seen });
const photo = (id: string, seen = false) => ({ id, photo: true, seen });

const ada: ViewerPerson = { userId: "ada", stories: [text("a1", true), text("a2"), text("a3")] };
const grace: ViewerPerson = { userId: "grace", stories: [photo("g1")] };
const linus: ViewerPerson = { userId: "linus", stories: [text("l1", true), text("l2", true)] };

describe("openViewer", () => {
  it("starts at the person's first unseen Story", () => {
    const state = openViewer([ada, grace], "ada");
    expect(current(state)?.storyId).toBe("a2");
    expect(state.elapsed).toBe(0);
  });

  it("starts at the first Story when every one has been seen", () => {
    expect(current(openViewer([linus], "linus"))?.storyId).toBe("l1");
  });

  it("is closed when the person has no Stories left", () => {
    expect(openViewer([ada], "nobody").closed).toBe(true);
  });
});

describe("the timer", () => {
  it("moves on after five seconds of a text Story", () => {
    let state = openViewer([ada], "ada");
    state = step(state, { type: "tick", ms: STORY_MS - 1 });
    expect(current(state)?.storyId).toBe("a2");
    state = step(state, { type: "tick", ms: 1 });
    expect(current(state)?.storyId).toBe("a3");
    expect(state.elapsed).toBe(0);
  });

  it("starts a photo's time only once it has loaded", () => {
    let state = openViewer([grace], "grace");
    expect(state.ready).toBe(false);
    state = step(state, { type: "tick", ms: STORY_MS * 2 });
    expect(current(state)?.storyId).toBe("g1");
    expect(state.elapsed).toBe(0);
    state = step(state, { type: "loaded", storyId: "g1" });
    state = step(state, { type: "tick", ms: 1000 });
    expect(state.elapsed).toBe(1000);
  });

  it("ignores a load reported for a Story no longer shown", () => {
    const state = step(openViewer([grace], "grace"), { type: "loaded", storyId: "other" });
    expect(state.ready).toBe(false);
  });
});

describe("going forward and back", () => {
  it("goes to the next and previous Story and restarts the time", () => {
    let state = step(openViewer([ada], "ada"), { type: "tick", ms: 2000 });
    state = step(state, { type: "next" });
    expect(current(state)?.storyId).toBe("a3");
    expect(state.elapsed).toBe(0);
    state = step(state, { type: "previous" });
    expect(current(state)?.storyId).toBe("a2");
    state = step(state, { type: "previous" });
    expect(current(state)?.storyId).toBe("a1");
  });

  it("restarts the very first Story when going back from it", () => {
    let state = step(openViewer([linus], "linus"), { type: "tick", ms: 3000 });
    state = step(state, { type: "previous" });
    expect(current(state)?.storyId).toBe("l1");
    expect(state.elapsed).toBe(0);
    expect(state.closed).toBe(false);
  });

  it("moves on to the next person, at their first unseen Story, after a person's last Story", () => {
    let state = openViewer([linus, ada], "linus");
    state = step(step(state, { type: "next" }), { type: "next" });
    expect(current(state)).toEqual({ userId: "ada", storyId: "a2", index: 1, count: 3 });
  });

  it("goes back to the previous person's last Story", () => {
    let state = openViewer([linus, ada], "ada");
    state = step(step(state, { type: "previous" }), { type: "previous" });
    expect(current(state)?.storyId).toBe("l2");
  });

  it("closes after the last person's last Story, by tapping or by the timer", () => {
    expect(step(step(openViewer([ada], "ada"), { type: "next" }), { type: "next" }).closed).toBe(true);
    let timed = openViewer([ada], "ada");
    timed = step(timed, { type: "tick", ms: STORY_MS });
    timed = step(timed, { type: "tick", ms: STORY_MS });
    expect(timed.closed).toBe(true);
  });

  it("starts with the person opened, even when people before them in the tray come first", () => {
    const state = openViewer([linus, ada, grace], "ada");
    expect(current(state)?.userId).toBe("ada");
    const after = step(step(state, { type: "next" }), { type: "next" });
    expect(current(after)?.userId).toBe("grace");
  });
});

describe("pausing", () => {
  it("holds the time while pressed and goes on when let go", () => {
    let state = step(openViewer([ada], "ada"), { type: "hold", held: true });
    state = step(state, { type: "tick", ms: STORY_MS * 3 });
    expect(current(state)?.storyId).toBe("a2");
    state = step(state, { type: "hold", held: false });
    state = step(state, { type: "tick", ms: 100 });
    expect(state.elapsed).toBe(100);
  });

  it("toggles a pause with Space or the Pause button, which stays through a hold", () => {
    let state = step(openViewer([ada], "ada"), { type: "togglePause" });
    expect(state.paused).toBe(true);
    state = step(step(state, { type: "hold", held: true }), { type: "hold", held: false });
    state = step(state, { type: "tick", ms: STORY_MS });
    expect(current(state)?.storyId).toBe("a2");
    state = step(state, { type: "togglePause" });
    state = step(state, { type: "tick", ms: STORY_MS });
    expect(current(state)?.storyId).toBe("a3");
  });

  it("waits while something is open over the Story (a menu, the list of viewers), keeping a toggled pause", () => {
    let state = step(openViewer([ada], "ada"), { type: "cover", covered: true });
    state = step(state, { type: "tick", ms: STORY_MS * 2 });
    expect(current(state)?.storyId).toBe("a2");
    state = step(state, { type: "cover", covered: false });
    state = step(state, { type: "tick", ms: 300 });
    expect(state.elapsed).toBe(300);
    const toggled = step(step(step(openViewer([ada], "ada"), { type: "togglePause" }), { type: "cover", covered: true }), { type: "cover", covered: false });
    expect(toggled.paused).toBe(true);
  });

  it("keeps a toggled pause when moving to another Story by hand", () => {
    const state = step(step(openViewer([ada], "ada"), { type: "togglePause" }), { type: "next" });
    expect(state.paused).toBe(true);
  });
});

describe("the tray changing underneath", () => {
  it("stays on the Story shown when others come or go", () => {
    let state = openViewer([ada], "ada");
    state = step(state, { type: "tick", ms: 1200 });
    state = step(state, { type: "sync", people: [{ userId: "ada", stories: [text("a2"), text("a3"), text("a4")] }] });
    expect(current(state)).toEqual({ userId: "ada", storyId: "a2", index: 0, count: 3 });
    expect(state.elapsed).toBe(1200);
  });

  it("moves to the next Story when the one shown is removed", () => {
    let state = openViewer([ada, grace], "ada");
    state = step(state, { type: "sync", people: [{ userId: "ada", stories: [text("a1", true), text("a3")] }, grace] });
    expect(current(state)?.storyId).toBe("a3");
    expect(state.elapsed).toBe(0);
  });

  it("moves to the next person when everything of the person shown is removed, and closes when nobody is left", () => {
    let state = openViewer([ada, grace], "ada");
    state = step(state, { type: "sync", people: [grace] });
    expect(current(state)?.userId).toBe("grace");
    expect(step(state, { type: "sync", people: [] }).closed).toBe(true);
  });

  it("keeps the people in the order they were opened in, and adds nobody new", () => {
    let state = openViewer([ada, grace], "ada");
    state = step(state, { type: "sync", people: [linus, grace, ada] });
    expect(state.people.map((person) => person.userId)).toEqual(["ada", "grace"]);
  });

  it("does nothing once closed", () => {
    const closed = step(step(step(openViewer([ada], "ada"), { type: "next" }), { type: "next" }), { type: "next" });
    expect(step(closed, { type: "tick", ms: 10 })).toBe(closed);
  });
});
