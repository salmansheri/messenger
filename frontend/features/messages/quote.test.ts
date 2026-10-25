import { describe, expect, it } from "vitest";
import type { MessageResponse, ReplyQuote } from "@/lib/api";
import { firstCharacters, quoteView, replyDraft, replyTarget, storyQuoteView } from "./quote";

const names: Record<string, string> = { ada: "Ada Lovelace", me: "You" };
const nameOf = (id: string | undefined) => (id ? (names[id] ?? "Someone who left") : "Someone");
const loaded = (...messages: MessageResponse[]) => (id: string | undefined) => messages.find((m) => m.id === id);

const quote = (overrides: Partial<ReplyQuote> = {}): ReplyQuote => ({
  messageId: "q1",
  senderId: "ada",
  text: "Are you free at nine?",
  deleted: false,
  unavailable: false,
  ...overrides,
});

describe("firstCharacters", () => {
  it("keeps a short text whole", () => {
    expect(firstCharacters("Hello", 100)).toBe("Hello");
  });

  it("cuts a long one at the limit and says so with an ellipsis", () => {
    expect(firstCharacters("x".repeat(150), 100)).toBe(`${"x".repeat(100)}…`);
  });

  it("counts characters the way people do, not UTF-16 units (an emoji is one)", () => {
    const text = "😀".repeat(101);

    expect(firstCharacters(text, 100)).toBe(`${"😀".repeat(100)}…`);
    expect(firstCharacters("😀".repeat(100), 100)).toBe("😀".repeat(100));
  });
});

describe("quoteView", () => {
  it("shows who said it and the start of what they said, from the server's quote when the Message is not loaded", () => {
    expect(quoteView(quote(), loaded(), nameOf)).toEqual({ kind: "text", messageId: "q1", sender: "Ada Lovelace", text: "Are you free at nine?" });
  });

  it("takes the text from the Message itself when it is loaded, so an edit shows through at once", () => {
    const edited: MessageResponse = { id: "q1", senderId: "ada", body: "Are you free at ten?", editedAt: "2026-03-10T10:05:00Z" };

    expect(quoteView(quote(), loaded(edited), nameOf)).toMatchObject({ kind: "text", text: "Are you free at ten?" });
  });

  it("shows a deletion at once when the Message is loaded and deleted", () => {
    const deleted: MessageResponse = { id: "q1", senderId: "ada", deletedAt: "2026-03-10T10:06:00Z" };

    expect(quoteView(quote(), loaded(deleted), nameOf)).toEqual({ kind: "deleted", messageId: "q1", sender: "Ada Lovelace" });
  });

  it("shows 'deleted' from the server's quote when the Message is not loaded", () => {
    expect(quoteView(quote({ deleted: true, text: undefined }), loaded(), nameOf)).toEqual({
      kind: "deleted",
      messageId: "q1",
      sender: "Ada Lovelace",
    });
  });

  it("shows nothing of a Message the person may not see (from before they joined, or hidden), not even who wrote it", () => {
    expect(quoteView(quote({ unavailable: true, text: undefined, senderId: undefined }), loaded(), nameOf)).toEqual({
      kind: "unavailable",
      messageId: "q1",
    });
  });

  it("puts a long or many-lined text on one line of the right length", () => {
    const edited: MessageResponse = { id: "q1", senderId: "ada", body: `Line one\n\n  line two ${"y".repeat(200)}` };

    const view = quoteView(quote(), loaded(edited), nameOf);

    expect(view.kind === "text" && view.text.startsWith("Line one line two yyyy")).toBe(true);
    expect(view.kind === "text" && [...view.text].length).toBe(101);
  });
});

describe("replyDraft", () => {
  it("is the quote of a Message the person chose to reply to, shaped like the server's", () => {
    const message: MessageResponse = { id: "m9", senderId: "ada", body: "See you\nat nine", seq: 9 };

    expect(replyDraft(message)).toEqual({ messageId: "m9", senderId: "ada", text: "See you at nine", deleted: false, unavailable: false });
  });
});

describe("replyTarget", () => {
  const draft = quote();

  it("stays while the Message is there, or not loaded", () => {
    expect(replyTarget(draft, loaded())).toBe(draft);
    expect(replyTarget(draft, loaded({ id: "q1", body: "x" }))).toBe(draft);
  });

  it("goes when the Message was deleted, because the server would refuse a reply to it", () => {
    expect(replyTarget(draft, loaded({ id: "q1", deletedAt: "2026-03-10T10:06:00Z" }))).toBeUndefined();
  });

  it("is nothing when there is no reply under way", () => {
    expect(replyTarget(undefined, loaded())).toBeUndefined();
  });
});

describe("quoting an image", () => {
  const attachment = { id: "a1", width: 4, height: 3, url: "u", thumbnailUrl: "t" };
  const image = (body?: string): MessageResponse => ({ id: "q1", senderId: "ada", body, attachment });

  it("shows Photo when the quoted Message is an image sent alone, and Photo with the caption otherwise", () => {
    expect(quoteView(quote(), loaded(image()), nameOf)).toMatchObject({ kind: "text", text: "Photo" });
    expect(quoteView(quote(), loaded(image("Lunch today")), nameOf)).toMatchObject({ kind: "text", text: "Photo: Lunch today" });
  });

  it("starts a reply to an image with the same words in the strip", () => {
    expect(replyDraft(image()).text).toBe("Photo");
    expect(replyDraft(image("Lunch today")).text).toBe("Photo: Lunch today");
  });
});

describe("storyQuoteView", () => {
  it("shows the start of a text Story", () => {
    expect(storyQuoteView({ storyId: "s1", kind: "TEXT", text: "Off to the coast", unavailable: false }, false)).toEqual({
      kind: "story",
      text: "Off to the coast",
      label: "In reply to your Story: Off to the coast",
    });
  });

  it("shows a photo Story as Photo, with its caption as the server words it", () => {
    expect(storyQuoteView({ storyId: "s1", kind: "PHOTO", text: "Photo", unavailable: false }, true)).toEqual({
      kind: "story",
      text: "Photo",
      label: "In reply to their Story: Photo",
    });
    expect(storyQuoteView({ storyId: "s1", kind: "PHOTO", text: undefined, unavailable: false }, true)).toMatchObject({ text: "Photo" });
  });

  it("says the Story is no longer available once it has gone", () => {
    expect(storyQuoteView({ unavailable: true }, false)).toEqual({
      kind: "unavailable",
      label: "In reply to a Story that is no longer available",
    });
  });
});
