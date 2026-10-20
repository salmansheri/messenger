import { describe, expect, it } from "vitest";
import { nextMenuIndex } from "./menu-keys";

describe("nextMenuIndex", () => {
  it("moves down and up, wrapping round at the ends", () => {
    expect(nextMenuIndex(3, 0, "ArrowDown")).toBe(1);
    expect(nextMenuIndex(3, 2, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(3, 1, "ArrowUp")).toBe(0);
    expect(nextMenuIndex(3, 0, "ArrowUp")).toBe(2);
  });

  it("jumps to the first or last item", () => {
    expect(nextMenuIndex(3, 1, "Home")).toBe(0);
    expect(nextMenuIndex(3, 1, "End")).toBe(2);
  });

  it("starts from the first item going down and the last going up when nothing is focused yet", () => {
    expect(nextMenuIndex(3, -1, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(3, -1, "ArrowUp")).toBe(2);
  });

  it("leaves every other key alone, and an empty menu has nowhere to go", () => {
    expect(nextMenuIndex(3, 1, "a")).toBeUndefined();
    expect(nextMenuIndex(0, -1, "ArrowDown")).toBeUndefined();
  });
});
