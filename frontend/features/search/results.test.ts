import { describe, expect, it } from "vitest";
import type { SearchPage, SearchResult } from "@/lib/api";
import { ApiProblem } from "@/lib/api/problem";
import { nextBefore, resultCountText, resultTime, resultsOf, searchFailureMessage } from "./results";

const result = (n: number): SearchResult => ({ messageId: `m${n}`, conversationId: "c1", seq: n, senderId: "grace", snippet: `note ${n}` });
const results = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => result(from - i));

describe("nextBefore", () => {
  it("asks for the next page after the last result while the server says more remain", () => {
    expect(nextBefore({ results: results(45, 26), hasMore: true })).toBe("m26");
  });

  it("stops when the server says there are no more, or the page is empty", () => {
    expect(nextBefore({ results: results(5, 1), hasMore: false })).toBeUndefined();
    expect(nextBefore({ results: [], hasMore: true })).toBeUndefined();
    expect(nextBefore({})).toBeUndefined();
  });
});

describe("resultsOf", () => {
  it("puts the pages together newest first, as the server sent them", () => {
    const pages: SearchPage[] = [
      { results: results(45, 26), hasMore: true },
      { results: results(25, 6), hasMore: true },
    ];
    expect(resultsOf(pages).map((r) => r.seq)).toEqual(results(45, 6).map((r) => r.seq));
  });

  it("shows a result only once, even when a Message is on two pages (one was sent while paging)", () => {
    const pages: SearchPage[] = [
      { results: results(45, 26), hasMore: true },
      { results: [result(26), ...results(25, 7)], hasMore: true },
    ];
    expect(resultsOf(pages).map((r) => r.seq)).toEqual(results(45, 7).map((r) => r.seq));
  });

  it("has nothing before the first page", () => {
    expect(resultsOf(undefined)).toEqual([]);
  });
});

describe("resultCountText", () => {
  it("says plainly when nothing was found", () => {
    expect(resultCountText(0, false)).toBe("No Messages found");
  });

  it("counts what was found, and says when there are more to show", () => {
    expect(resultCountText(1, false)).toBe("1 Message found");
    expect(resultCountText(12, false)).toBe("12 Messages found");
    expect(resultCountText(20, true)).toBe("20 Messages found so far, and more");
  });
});

describe("searchFailureMessage", () => {
  const problem = (status: number, retryAfterSeconds?: number) => new ApiProblem(status, "Problem", undefined, {}, retryAfterSeconds);

  it("says how long to wait after searching too often", () => {
    expect(searchFailureMessage(problem(429, 40))).toBe("You are searching too often. Try again in a moment.");
    expect(searchFailureMessage(problem(429, 600))).toBe("You are searching too often. Try again in 10 minutes.");
    expect(searchFailureMessage(problem(429))).toBe("You are searching too often. Try again later.");
  });

  it("keeps the general wording for a busy server and everything else", () => {
    expect(searchFailureMessage(problem(503))).toBe("The server is busy. Try again in a moment.");
    expect(searchFailureMessage(problem(0))).toBe("Could not reach the server. Check your connection and try again.");
  });

  it("says the Conversation is gone rather than repeat the server's not-found wording", () => {
    expect(searchFailureMessage(problem(404))).toBe("This Conversation is no longer yours to search.");
  });
});

describe("resultTime", () => {
  const now = new Date("2026-03-11T15:00:00Z");

  it("gives the time alone for today, and the day with the time before that", () => {
    expect(resultTime("2026-03-11T09:05:00Z", now, "UTC")).toBe("09:05");
    expect(resultTime("2026-03-10T21:30:00Z", now, "UTC")).toBe("Yesterday, 21:30");
    expect(resultTime("2025-12-24T08:00:00Z", now, "UTC")).toMatch(/24.*08:00$/);
  });

  it("gives nothing for a time it cannot read", () => {
    expect(resultTime(undefined, now, "UTC")).toBe("");
    expect(resultTime("not a time", now, "UTC")).toBe("");
  });
});
