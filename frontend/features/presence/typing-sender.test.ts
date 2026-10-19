import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTypingSender } from "./typing-sender";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const sent: boolean[] = [];
  const sender = createTypingSender({ publish: (typing) => sent.push(typing) });
  return { sender, sent };
}

describe("the typing sender", () => {
  it("says typing on the first keystroke, and not again for every one after it", () => {
    const { sender, sent } = setup();
    for (let n = 0; n < 20; n++) {
      sender.keystroke();
      vi.advanceTimersByTime(100);
    }
    expect(sent).toEqual([true]);
  });

  it("repeats typing every few seconds while the person keeps typing", () => {
    const { sender, sent } = setup();
    for (let n = 0; n < 100; n++) {
      sender.keystroke();
      vi.advanceTimersByTime(100); // ten seconds of typing
    }
    expect(sent, "a start about every 3s, never one per keystroke").toEqual([true, true, true, true]);
  });

  it("says stopped when the person stops typing for a while", () => {
    const { sender, sent } = setup();
    sender.keystroke();
    vi.advanceTimersByTime(3_900);
    expect(sent).toEqual([true]);
    vi.advanceTimersByTime(200);
    expect(sent).toEqual([true, false]);
    vi.advanceTimersByTime(60_000);
    expect(sent, "nothing more once stopped").toEqual([true, false]);
  });

  it("says stopped at once when told to (sent, or the box emptied), but only if it had said typing", () => {
    const { sender, sent } = setup();
    sender.stop();
    expect(sent).toEqual([]);
    sender.keystroke();
    sender.stop();
    sender.stop();
    expect(sent).toEqual([true, false]);
  });

  it("starts again right away on the next keystroke after stopping", () => {
    const { sender, sent } = setup();
    sender.keystroke();
    sender.stop();
    sender.keystroke();
    expect(sent).toEqual([true, false, true]);
  });

  it("says nothing more after being stopped, until the next keystroke", () => {
    const { sender, sent } = setup();
    sender.keystroke();
    sender.stop();
    vi.advanceTimersByTime(60_000);
    expect(sent, "a stop was sent, then silence").toEqual([true, false]);
  });
});
