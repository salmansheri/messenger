import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import { announcementOf, announcementsFor, LONGEST_SPOKEN, unannounced } from "./announce";

const msg = (seq: number, senderId: string, body = `m${seq}`): MessageResponse => ({ seq, senderId, body });

describe("unannounced", () => {
  it("is the Messages from other people that came after the last one announced, oldest first", () => {
    const messages = [msg(1, "grace"), msg(2, "me"), msg(3, "grace"), msg(4, "linus")];
    expect(unannounced(messages, 1, "me").map((m) => m.seq)).toEqual([3, 4]);
  });

  it("is nothing for your own Messages, and nothing when there is nothing new", () => {
    expect(unannounced([msg(5, "me")], 4, "me")).toEqual([]);
    expect(unannounced([msg(5, "grace")], 5, "me")).toEqual([]);
    expect(unannounced([], 0, "me")).toEqual([]);
  });

  it("does not announce anything when it is not known who you are (it could be your own)", () => {
    expect(unannounced([msg(5, "grace")], 0, undefined)).toEqual([]);
  });
});

describe("announcementOf", () => {
  it("says who wrote it and what, on one line", () => {
    expect(announcementOf(msg(1, "grace", "Are you free\nat nine?"), "Grace Hopper")).toBe("Grace Hopper: Are you free at nine?");
  });

  it("keeps a very long Message short enough to listen to", () => {
    const spoken = announcementOf(msg(1, "grace", "a".repeat(500)), "Grace");
    expect(spoken.length).toBeLessThanOrEqual(LONGEST_SPOKEN + "Grace: …".length);
    expect(spoken.endsWith("…")).toBe(true);
  });
});

describe("announcementsFor", () => {
  const names = (id: string | undefined) => ({ grace: "Grace Hopper", linus: "Linus Torvalds" })[id ?? ""] ?? "Someone";
  const arrived = (n: number) => Array.from({ length: n }, (_, i) => msg(10 + i, i % 2 ? "linus" : "grace", `text ${i}`));

  it("reads out each of a few new Messages, with who wrote it", () => {
    expect(announcementsFor(arrived(2), names).map((line) => line.text)).toEqual([
      "Grace Hopper: text 0",
      "Linus Torvalds: text 1",
    ]);
  });

  it("says only how many when a lot arrive together (after a reconnect, say), instead of reading them all out", () => {
    const lines = announcementsFor(arrived(6), names);
    expect(lines).toEqual([{ seq: 15, text: "6 new Messages" }]);
  });

  it("reads out up to three one by one", () => {
    expect(announcementsFor(arrived(3), names)).toHaveLength(3);
    expect(announcementsFor(arrived(4), names)).toHaveLength(1);
  });

  it("is nothing when nothing is new", () => {
    expect(announcementsFor([], names)).toEqual([]);
  });

  it("calls someone who is no longer in the Conversation 'Someone'", () => {
    expect(announcementsFor([msg(1, "gone", "hi")], names)[0].text).toBe("Someone: hi");
  });
});
