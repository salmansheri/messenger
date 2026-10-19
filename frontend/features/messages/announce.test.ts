import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import { announcementOf, unannounced } from "./announce";

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
    expect(spoken.length).toBeLessThanOrEqual(220);
    expect(spoken.endsWith("…")).toBe(true);
  });
});
