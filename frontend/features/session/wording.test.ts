import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { avatarFailureMessage, nameChangeFailureMessage } from "./wording";

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

describe("avatarFailureMessage", () => {
  it("says how long to wait when the Avatar was changed too often", () => {
    expect(avatarFailureMessage(problem(429, 3600))).toBe("You have changed your Avatar too often. Try again in 1 hour.");
    expect(avatarFailureMessage(problem(429))).toBe("You have changed your Avatar too often. Try again later.");
  });

  it("names the size limit for a file that is too large", () => {
    expect(avatarFailureMessage(problem(413))).toBe("That image is larger than 10 MB.");
  });

  it("passes on the server's reason for a picture it refused", () => {
    const refused = new ApiProblem(400, "Bad Request", "That file is not an image we can read.", {}, undefined);
    expect(avatarFailureMessage(refused)).toBe("That file is not an image we can read.");
    expect(avatarFailureMessage(problem(400))).toBe("That picture could not be used. Choose a PNG, JPEG, WebP or GIF image.");
  });

  it("keeps the general wording for everything else", () => {
    expect(avatarFailureMessage(problem(503))).toBe("The server is busy. Try again in a moment.");
  });
});
