import { describe, expect, it } from "vitest";
import { ApiProblem, NETWORK_FAILURE } from "@/lib/api/problem";
import { changeFailureMessage, sendFailureMessage } from "./wording";

const problem = (status: number, retryAfterSeconds?: number) =>
  new ApiProblem(status, "Problem", undefined, {}, retryAfterSeconds);

const problem409 = (detail: string) => new ApiProblem(409, "Conflict", detail, {}, undefined);

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

  it("passes on the server's words when a reply is refused, and does not call it an account problem", () => {
    expect(sendFailureMessage(problem409("You cannot reply to a deleted Message."), true)).toBe("You cannot reply to a deleted Message.");
    expect(sendFailureMessage(problem(409), true)).toBe("That can no longer be done.");
  });

  it("says the Message being answered is gone only when the send was a reply", () => {
    expect(sendFailureMessage(problem(404), true)).toBe("The Message you were replying to is no longer there.");
    expect(sendFailureMessage(problem(404), false)).toBe("This Conversation is no longer yours.");
  });

  it("leaves every other failure to the general wording", () => {
    expect(sendFailureMessage(problem(503, 5))).toBe("The server is busy. Try again in a moment.");
    expect(sendFailureMessage(problem(NETWORK_FAILURE))).toContain("Could not reach the server");
    expect(sendFailureMessage(problem(400))).toBe("Problem");
  });
});

describe("changeFailureMessage", () => {
  it("passes on the server's own words when the time to edit or delete has passed, or the Message was deleted", () => {
    const refused = new ApiProblem(409, "Conflict", "A Message can only be edited for 15 minutes after it is sent.", {}, undefined);

    expect(changeFailureMessage(refused)).toBe("A Message can only be edited for 15 minutes after it is sent.");
  });

  it("does not describe a 409 as an account problem when the server gave no words", () => {
    expect(changeFailureMessage(problem(409))).toBe("That can no longer be done.");
  });

  it("says who may change a Message and that a vanished one is gone", () => {
    expect(changeFailureMessage(problem(403))).toBe("Only the sender can do that.");
    expect(changeFailureMessage(problem(404))).toBe("That Message is no longer there.");
  });

  it("names the wait when changes come too often", () => {
    expect(changeFailureMessage(problem(429, 20))).toBe("You are changing Messages too often. Try again in 20 seconds.");
    expect(changeFailureMessage(problem(429, 120))).toBe("You are changing Messages too often. Try again in 2 minutes.");
    expect(changeFailureMessage(problem(429))).toBe("You are changing Messages too often. Try again in a few seconds.");
  });

  it("leaves a busy server and a lost connection to the general wording", () => {
    expect(changeFailureMessage(problem(503, 5))).toBe("The server is busy. Try again in a moment.");
    expect(changeFailureMessage(problem(NETWORK_FAILURE))).toContain("Could not reach the server");
  });
});
