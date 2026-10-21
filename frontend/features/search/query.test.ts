import { describe, expect, it } from "vitest";
import { checkSearchQuery } from "./query";

describe("checkSearchQuery", () => {
  it("is ready to search with the text trimmed", () => {
    expect(checkSearchQuery("  meet at noon ")).toEqual({ kind: "ready", q: "meet at noon" });
    expect(checkSearchQuery("ab")).toEqual({ kind: "ready", q: "ab" });
  });

  it("does nothing for an empty or one-character query", () => {
    for (const typed of ["", "   ", "a", " é ", "🙂", "\u0000\u0000"]) {
      expect(checkSearchQuery(typed)).toEqual({ kind: "idle" });
    }
  });

  it("counts characters as people see them, as the server does", () => {
    expect(checkSearchQuery("🙂🙂")).toEqual({ kind: "ready", q: "🙂🙂" });
    expect(checkSearchQuery("🙂".repeat(100))).toEqual({ kind: "ready", q: "🙂".repeat(100) });
  });

  it("says when a query is longer than 100 characters instead of sending it", () => {
    expect(checkSearchQuery("x".repeat(101))).toEqual({ kind: "too-long", message: "Search for at most 100 characters." });
    expect(checkSearchQuery(`  ${"x".repeat(100)}  `)).toEqual({ kind: "ready", q: "x".repeat(100) });
  });

  it("leaves out NUL characters, which the server cannot take", () => {
    expect(checkSearchQuery("me\u0000et")).toEqual({ kind: "ready", q: "meet" });
  });
});
