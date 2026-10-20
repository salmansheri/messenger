import { describe, expect, it } from "vitest";
import { ApiProblem, NETWORK_FAILURE } from "@/lib/api/problem";
import { sendFailureMessage } from "./wording";

const problem = (status: number, retryAfterSeconds?: number) =>
  new ApiProblem(status, "Problem", undefined, {}, retryAfterSeconds);

describe("sendFailureMessage", () => {
  it("names the seconds to wait when the server throttles sending", () => {
    expect(sendFailureMessage(problem(429, 12))).toBe("You are sending Messages too often. Try again in 12 seconds.");
    expect(sendFailureMessage(problem(429, 1))).toBe("You are sending Messages too often. Try again in 1 second.");
  });

  it("rounds a fraction up and never promises less than a second", () => {
    expect(sendFailureMessage(problem(429, 0))).toBe("You are sending Messages too often. Try again in 1 second.");
    expect(sendFailureMessage(problem(429, 4.2))).toBe("You are sending Messages too often. Try again in 5 seconds.");
  });

  it("switches to minutes from a minute on, in the general wording", () => {
    expect(sendFailureMessage(problem(429, 60))).toBe("You are sending Messages too often. Try again in 1 minute.");
    expect(sendFailureMessage(problem(429, 95))).toBe("You are sending Messages too often. Try again in 2 minutes.");
  });

  it("says a few seconds when the server did not say how long", () => {
    expect(sendFailureMessage(problem(429))).toBe("You are sending Messages too often. Try again in a few seconds.");
  });

  it("leaves every other failure to the general wording", () => {
    expect(sendFailureMessage(problem(503, 5))).toBe("The server is busy. Try again in a moment.");
    expect(sendFailureMessage(problem(NETWORK_FAILURE))).toContain("Could not reach the server");
    expect(sendFailureMessage(problem(400))).toBe("Problem");
  });
});
