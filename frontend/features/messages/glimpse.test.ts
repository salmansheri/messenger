import { describe, expect, it } from "vitest";
import { glimpse } from "./glimpse";

describe("a glimpse of a Message", () => {
  it("is the start of the text for a text Message, on one line", () => {
    expect(glimpse("Hello\n  there", false, 100)).toBe("Hello there");
    expect(glimpse("x".repeat(101), false, 100)).toBe(`${"x".repeat(100)}…`);
  });

  it("says Photo for an image sent alone, and Photo with the caption otherwise", () => {
    expect(glimpse(undefined, true, 100)).toBe("Photo");
    expect(glimpse(null, true, 100)).toBe("Photo");
    expect(glimpse("  ", true, 100)).toBe("Photo");
    expect(glimpse("Lunch\ntoday", true, 100)).toBe("Photo: Lunch today");
    expect(glimpse("y".repeat(150), true, 100)).toBe(`Photo: ${"y".repeat(100)}…`);
  });
});
