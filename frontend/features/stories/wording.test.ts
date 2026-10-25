import { describe, expect, it } from "vitest";
import { photoAlternative, replyPlaceholder, seenByText, storyReplyFailureMessage, storySummary } from "./wording";
import type { ApiProblem } from "@/lib/api";

describe("photoAlternative", () => {
  it("names who posted the photo, and adds its caption when there is one", () => {
    expect(photoAlternative("Grace Hopper", "At the harbour")).toBe("Photo by Grace Hopper: At the harbour");
    expect(photoAlternative("Grace Hopper", undefined)).toBe("Photo by Grace Hopper");
  });
});

describe("storySummary", () => {
  it("says whose Story it is, which of how many, and when it was posted", () => {
    expect(storySummary({ own: false, name: "Grace Hopper", index: 1, count: 3, when: "14:02" })).toBe("Grace Hopper's Story, 2 of 3, posted 14:02");
    expect(storySummary({ own: true, name: "You", index: 0, count: 1, when: "Yesterday" })).toBe("Your Story, 1 of 1, posted Yesterday");
  });
});

describe("seenByText", () => {
  it("says how many people saw your Story", () => {
    expect(seenByText(0)).toBe("Seen by 0");
    expect(seenByText(3)).toBe("Seen by 3");
  });
});

describe("replyPlaceholder", () => {
  it("invites a reply to the poster by first name", () => {
    expect(replyPlaceholder("Grace Hopper")).toBe("Reply to Grace…");
    expect(replyPlaceholder(undefined)).toBe("Reply…");
  });
});

describe("storyReplyFailureMessage", () => {
  const problem = (status: number, extra: Partial<ApiProblem> = {}) => ({ status, title: "t", ...extra }) as ApiProblem;

  it("says the Story has gone when the server no longer finds it", () => {
    expect(storyReplyFailureMessage(problem(404))).toBe("This Story is no longer there.");
  });

  it("words everything else as for any send", () => {
    expect(storyReplyFailureMessage(problem(429, { retryAfterSeconds: 30 }))).toMatch(/^You are sending Messages too often\. Try again in/);
    expect(storyReplyFailureMessage(problem(409, { detail: "Unblock this person to send them Messages." }))).toBe("Unblock this person to send them Messages.");
  });
});
