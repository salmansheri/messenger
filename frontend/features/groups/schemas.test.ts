import { describe, expect, it } from "vitest";
import { checkGroupName } from "./schemas";

describe("checkGroupName", () => {
  it("accepts a name and trims the ends", () => {
    expect(checkGroupName("  Analytical Engine ")).toEqual({ ok: true, name: "Analytical Engine" });
  });

  it("asks for a name when there is none, or only spaces", () => {
    for (const blank of ["", "   ", "\n"]) {
      expect(checkGroupName(blank)).toEqual({ ok: false, message: "Give the Group a name." });
    }
  });

  it("allows exactly 100 characters, counted like the backend (code points), and refuses one more", () => {
    expect(checkGroupName("a".repeat(100)).ok).toBe(true);
    expect(checkGroupName("😀".repeat(100)).ok).toBe(true);
    expect(checkGroupName("a".repeat(101))).toEqual({ ok: false, message: "Use at most 100 characters." });
  });

  it("refuses the NUL character, which cannot be stored", () => {
    expect(checkGroupName("bad\u0000name")).toEqual({ ok: false, message: "Remove the special character from the name." });
  });
});
