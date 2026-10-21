import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import {
  announcementOf,
  announcementsFor,
  changeAnnouncements,
  changedMessages,
  LONGEST_SPOKEN,
  unannounced,
  versionOf,
} from "./announce";

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

  it("has nothing to read out for a Message that is already deleted when it turns up (a catch-up)", () => {
    const gone: MessageResponse = { seq: 3, senderId: "grace", deletedAt: "2026-03-10T10:06:00Z" };

    expect(unannounced([gone, msg(4, "grace")], 2, "me").map((m) => m.seq)).toEqual([4]);
  });

  it("does not announce anything when it is not known who you are (it could be your own)", () => {
    expect(unannounced([msg(5, "grace")], 0, undefined)).toEqual([]);
  });
});

describe("announcementOf an image", () => {
  const attachment = { id: "a1", width: 4, height: 3, url: "u", thumbnailUrl: "t" };

  it("says who sent an image, with the caption when there is one", () => {
    expect(announcementOf({ ...msg(1, "grace", "Lunch today"), attachment }, "Grace Hopper")).toBe("Grace Hopper sent an image: Lunch today");
    expect(announcementOf({ ...msg(1, "grace", ""), body: undefined, attachment }, "Grace Hopper")).toBe("Grace Hopper sent an image");
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

describe("changes to Messages already there", () => {
  const edited = (seq: number, senderId: string, body: string, at = "2026-03-10T10:05:00Z"): MessageResponse => ({ seq, senderId, body, editedAt: at });
  const deleted = (seq: number, senderId: string, at = "2026-03-10T10:06:00Z"): MessageResponse => ({ seq, senderId, deletedAt: at });

  it("tells an original, an edit and a deletion apart", () => {
    expect(versionOf(msg(1, "a"))).not.toBe(versionOf(edited(1, "a", "x")));
    expect(versionOf(edited(1, "a", "x"))).not.toBe(versionOf(deleted(1, "a")));
    expect(versionOf(edited(1, "a", "x"))).toBe(versionOf(edited(1, "a", "y")));
  });

  it("finds the Messages whose version changed since they were last seen, and none that are new or the same", () => {
    const known = new Map([[1, versionOf(msg(1, "a"))], [2, versionOf(msg(2, "a"))], [3, versionOf(msg(3, "a"))]]);

    const changed = changedMessages(known, [msg(1, "a"), edited(2, "a", "x"), deleted(3, "a"), msg(4, "a")]);

    expect(changed.map((m) => m.seq)).toEqual([2, 3]);
  });

  it("says who edited or deleted a Message, with the new text for an edit by someone else", () => {
    const names = (id: string | undefined) => (id === "grace" ? "Grace" : "Someone");

    expect(changeAnnouncements([edited(2, "grace", "See you at ten")], names, "me")).toEqual([
      { seq: 2, text: "Grace edited a Message: See you at ten", change: versionOf(edited(2, "grace", "x")) },
    ]);
    expect(changeAnnouncements([deleted(3, "grace")], names, "me")[0].text).toBe("Grace deleted a Message");
  });

  it("confirms your own edit or deletion without reading your text back", () => {
    const names = () => "Me";

    expect(changeAnnouncements([edited(2, "me", "secret words")], names, "me")[0].text).toBe("You edited a Message");
    expect(changeAnnouncements([deleted(3, "me")], names, "me")[0].text).toBe("You deleted a Message");
  });

  it("gives each burst of many its own line, even for the same number of Messages", () => {
    const first = changeAnnouncements([deleted(1, "g"), deleted(2, "g"), deleted(3, "g"), deleted(4, "g")], () => "G", "me");
    const second = changeAnnouncements([deleted(5, "g"), deleted(6, "g"), deleted(7, "g"), deleted(8, "g")], () => "G", "me");

    expect(first[0].change).not.toBe(second[0].change);
  });

  it("only counts them when there are many at once", () => {
    const many = [deleted(1, "g"), deleted(2, "g"), deleted(3, "g"), deleted(4, "g")];

    expect(changeAnnouncements(many, () => "Grace", "me").map((line) => line.text)).toEqual(["4 Messages were changed"]);
  });
});
