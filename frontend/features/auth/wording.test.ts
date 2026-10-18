import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api";
import { describeWait, messageFor, WRONG_CODE_LIMIT } from "./wording";

const problem = (status: number, retryAfterSeconds?: number, title = "x") =>
  new ApiProblem(status, title, undefined, {}, retryAfterSeconds);

describe("describeWait", () => {
  it("speaks in the units a person would", () => {
    expect(describeWait(0)).toBe("a moment");
    expect(describeWait(20)).toBe("a moment");
    expect(describeWait(60)).toBe("1 minute");
    expect(describeWait(95)).toBe("2 minutes");
    expect(describeWait(15 * 60)).toBe("15 minutes");
    expect(describeWait(3600)).toBe("1 hour");
    expect(describeWait(3600 + 20 * 60)).toBe("2 hours");
    expect(describeWait(5 * 3600)).toBe("5 hours");
  });
});

describe("messageFor", () => {
  it("tells a rate-limited visitor when to try again", () => {
    expect(messageFor(problem(429, 1800))).toBe("Too many codes were requested. Try again in 30 minutes.");
    expect(messageFor(problem(429))).toBe("Too many codes were requested. Try again later.");
  });

  it("explains a taken address", () => {
    expect(messageFor(problem(409))).toBe("An account with this email already exists. Try signing in instead.");
  });

  it("is calm about a busy or unreachable server", () => {
    expect(messageFor(problem(503, 5))).toBe("The server is busy. Try again in a moment.");
    expect(messageFor(problem(0))).toBe("Could not reach the server. Check your connection and try again.");
    expect(messageFor(problem(500))).toBe("Something went wrong on our side. Try again in a moment.");
  });

  it("does not claim to know why a code was refused", () => {
    expect(messageFor(problem(400, undefined, "Bad Request"), "code")).toBe(
      "That code is wrong or has expired. Check it, or ask for a new one.",
    );
  });

  it("knows how many wrong tries a code allows", () => {
    expect(WRONG_CODE_LIMIT).toBe(5);
  });
});
