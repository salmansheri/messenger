import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api";
import { SelfConversationError, startDirectOutcome } from "./wording";

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
