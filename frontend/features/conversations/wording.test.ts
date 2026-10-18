import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api";
import { blamesTheAddress, SelfConversationError, startDirectMessageFor } from "./wording";

const problem = (status: number, retryAfterSeconds?: number) =>
  new ApiProblem(status, "x", undefined, {}, retryAfterSeconds);

describe("startDirectMessageFor", () => {
  it("explains an address nobody can be reached at, whether unknown or never verified", () => {
    expect(startDirectMessageFor(problem(404))).toBe(
      "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.",
    );
  });

  it("explains that you cannot talk to yourself, whether noticed here or refused by the server", () => {
    const message = "You cannot start a Conversation with yourself.";
    expect(startDirectMessageFor(new SelfConversationError())).toBe(message);
    expect(startDirectMessageFor(problem(400))).toBe(message);
  });

  it("tells someone who looks people up too often when to try again", () => {
    expect(startDirectMessageFor(problem(429, 90))).toBe("You are doing that too often. Try again in 2 minutes.");
  });

  it("is calm about everything else, even something that is not a problem from the API", () => {
    expect(startDirectMessageFor(problem(0))).toBe("Could not reach the server. Check your connection and try again.");
    expect(startDirectMessageFor(new Error("boom"))).toBe(
      "Something went wrong on our side. Try again in a moment.",
    );
  });
});

describe("blamesTheAddress", () => {
  it("is true for an unknown address and for your own, false for trouble that is not about it", () => {
    expect(blamesTheAddress(problem(404))).toBe(true);
    expect(blamesTheAddress(problem(400))).toBe(true);
    expect(blamesTheAddress(new SelfConversationError())).toBe(true);
    expect(blamesTheAddress(problem(429, 5))).toBe(false);
    expect(blamesTheAddress(problem(0))).toBe(false);
    expect(blamesTheAddress(new Error("boom"))).toBe(false);
  });
});
