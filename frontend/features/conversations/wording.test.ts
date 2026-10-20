import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api";
import { SelfConversationError, settingsFailureMessage, startDirectOutcome } from "./wording";

const problem = (status: number, retryAfterSeconds?: number) =>
  new ApiProblem(status, "x", undefined, {}, retryAfterSeconds);

describe("startDirectOutcome", () => {
  it("explains an address nobody can be reached at, whether unknown or never verified, under the address", () => {
    expect(startDirectOutcome(problem(404))).toEqual({
      message: "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.",
      about: "address",
    });
  });

  it("explains that you cannot talk to yourself, whether noticed here or refused by the server", () => {
    const outcome = { message: "You cannot start a Conversation with yourself.", about: "address" };
    expect(startDirectOutcome(new SelfConversationError())).toEqual(outcome);
    expect(startDirectOutcome(problem(400))).toEqual(outcome);
  });

  it("tells someone who looks people up too often when to try again, for the form as a whole", () => {
    expect(startDirectOutcome(problem(429, 90))).toEqual({
      message: "You are doing that too often. Try again in 2 minutes.",
      about: "form",
    });
  });

  it("is calm about everything else, even something that is not a problem from the API", () => {
    expect(startDirectOutcome(problem(0))).toEqual({
      message: "Could not reach the server. Check your connection and try again.",
      about: "form",
    });
    expect(startDirectOutcome(new Error("boom"))).toEqual({
      message: "Something went wrong on our side. Try again in a moment.",
      about: "form",
    });
  });
});

describe("settingsFailureMessage", () => {
  const problem = (status: number, detail?: string, retryAfterSeconds?: number) =>
    new ApiProblem(status, "Problem", detail, {}, retryAfterSeconds);

  it("passes on the server's own plain words for a refused pin", () => {
    expect(settingsFailureMessage(problem(409, "You can pin at most 3 Conversations."))).toBe("You can pin at most 3 Conversations.");
    expect(settingsFailureMessage(problem(409, "Unarchive it before pinning."))).toBe("Unarchive it before pinning.");
  });

  it("does not describe a 409 as an account problem when the server gave no words", () => {
    expect(settingsFailureMessage(problem(409))).toBe("That can no longer be done.");
  });

  it("says a Conversation that is gone is gone, and leaves the rest to the general wording", () => {
    expect(settingsFailureMessage(problem(404))).toBe("This Conversation is no longer yours.");
    expect(settingsFailureMessage(problem(503, undefined, 5))).toBe("The server is busy. Try again in a moment.");
    expect(settingsFailureMessage(problem(429, undefined, 300))).toBe("You are doing that too often. Try again in 5 minutes.");
  });
});
