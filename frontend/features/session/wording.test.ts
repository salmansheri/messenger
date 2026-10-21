import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { nameChangeFailureMessage } from "./wording";

const problem = (status: number, retryAfterSeconds?: number) => new ApiProblem(status, "Problem", undefined, {}, retryAfterSeconds);

describe("nameChangeFailureMessage", () => {
  it("says how long to wait when too many changes were made", () => {
    expect(nameChangeFailureMessage(problem(429, 1800))).toBe("You have changed your name too often. Try again in 30 minutes.");
    expect(nameChangeFailureMessage(problem(429))).toBe("You have changed your name too often. Try again later.");
  });

  it("keeps the general wording for everything else", () => {
    expect(nameChangeFailureMessage(problem(503))).toBe("The server is busy. Try again in a moment.");
  });
});
