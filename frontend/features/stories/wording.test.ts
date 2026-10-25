import { describe, expect, it } from "vitest";
import { photoAlternative, storySummary } from "./wording";

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
