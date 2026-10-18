import { describe, expect, it } from "vitest";
import { afterWrongCode, NO_WRONG_TRIES, WRONG_CODE_LIMIT, wrongTriesExhausted } from "./wrong-tries";

describe("wrong tries", () => {
  it("counts failed tries for one address", () => {
    let tries = NO_WRONG_TRIES;
    for (let n = 1; n <= 3; n++) {
      tries = afterWrongCode(tries, "ada@example.com");
      expect(tries.count).toBe(n);
    }
  });

  it("starts again from one when the address changes", () => {
    let tries = NO_WRONG_TRIES;
    for (let n = 0; n < 4; n++) tries = afterWrongCode(tries, "ada@example.com");

    tries = afterWrongCode(tries, "grace@example.com");

    expect(tries).toEqual({ email: "grace@example.com", count: 1 });
  });

  it("is exhausted once the backend's limit of wrong tries per code is reached", () => {
    let tries = NO_WRONG_TRIES;
    for (let n = 1; n < WRONG_CODE_LIMIT; n++) {
      tries = afterWrongCode(tries, "ada@example.com");
      expect(wrongTriesExhausted(tries)).toBe(false);
    }
    tries = afterWrongCode(tries, "ada@example.com");
    expect(wrongTriesExhausted(tries)).toBe(true);
    expect(wrongTriesExhausted(afterWrongCode(tries, "ada@example.com"))).toBe(true);
  });

  it("matches the limit the backend allows per code (5, see app.otp.max-attempts)", () => {
    expect(WRONG_CODE_LIMIT).toBe(5);
  });
});
