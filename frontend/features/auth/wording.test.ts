import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { codeMessageFor, codesMessageFor, refusedCodeMessage, signInMessageFor } from "./wording";
import { afterWrongCode, NO_WRONG_TRIES } from "./wrong-tries";

const problem = (status: number, retryAfterSeconds?: number, title = "x") =>
  new ApiProblem(status, title, undefined, {}, retryAfterSeconds);

describe("codesMessageFor", () => {
  it("says it was codes that were asked for too often", () => {
    expect(codesMessageFor(problem(429, 1800))).toBe("Too many codes were requested. Try again in 30 minutes.");
    expect(codesMessageFor(problem(429))).toBe("Too many codes were requested. Try again later.");
  });

  it("leaves every other failure to the general wording", () => {
    expect(codesMessageFor(problem(409))).toBe(messageFor(problem(409)));
    expect(codesMessageFor(problem(0))).toBe(messageFor(problem(0)));
  });
});

describe("codeMessageFor", () => {
  it("does not claim to know why a code was refused", () => {
    expect(codeMessageFor(problem(400, undefined, "Bad Request"))).toBe(
      "That code is wrong or has expired. Check it, or ask for a new one.",
    );
  });

  it("leaves every other failure to the general wording", () => {
    expect(codeMessageFor(problem(0))).toBe(messageFor(problem(0)));
    expect(codeMessageFor(problem(503))).toBe(messageFor(problem(503)));
  });
});

describe("signInMessageFor", () => {
  it("gives one answer whether the address is unknown or the password is wrong", () => {
    expect(signInMessageFor(problem(401))).toBe("That email and password do not match. Check them and try again.");
  });

  it("leaves every other failure to the general wording", () => {
    expect(signInMessageFor(problem(0))).toBe(messageFor(problem(0)));
    expect(signInMessageFor(problem(429, 600))).toBe(messageFor(problem(429, 600)));
  });
});

describe("refusedCodeMessage", () => {
  it("says the code is wrong or expired for the first few refusals", () => {
    const tries = afterWrongCode(NO_WRONG_TRIES, "ada@example.com");
    expect(refusedCodeMessage(tries, problem(400))).toBe(codeMessageFor(problem(400)));
  });

  it("says a new code is needed once the backend's limit of wrong tries has been reached", () => {
    let tries = NO_WRONG_TRIES;
    for (let n = 0; n < 5; n++) tries = afterWrongCode(tries, "ada@example.com");
    expect(refusedCodeMessage(tries, problem(400))).toBe(
      "That did not work again. A code stops working after 5 wrong tries, so ask for a new one.",
    );
  });
});
