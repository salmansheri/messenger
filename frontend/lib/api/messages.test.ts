import { describe, expect, it } from "vitest";
import { ApiProblem } from "./problem";
import { describeWait, messageFor } from "./messages";

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
  it("tells someone who is going too fast when to try again", () => {
    expect(messageFor(problem(429, 1800))).toBe("You are doing that too often. Try again in 30 minutes.");
    expect(messageFor(problem(429))).toBe("You are doing that too often. Try again later.");
  });

  it("explains a taken address", () => {
    expect(messageFor(problem(409))).toBe("An account with this email already exists. Try signing in instead.");
  });

  it("is calm about a busy or unreachable server", () => {
    expect(messageFor(problem(503, 5))).toBe("The server is busy. Try again in a moment.");
    expect(messageFor(problem(0))).toBe("Could not reach the server. Check your connection and try again.");
    expect(messageFor(problem(500))).toBe("Something went wrong on our side. Try again in a moment.");
  });

  it("passes the backend's own words through for a bad request", () => {
    const refused = new ApiProblem(400, "Bad Request", "Invalid request content.", {}, undefined);
    expect(messageFor(refused)).toBe("Invalid request content.");
  });
});

