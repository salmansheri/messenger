import { describe, expect, it } from "vitest";
import { checkMessageBody } from "./schema";

describe("checkMessageBody", () => {
  it("accepts text and trims the ends but keeps line breaks inside", () => {
    expect(checkMessageBody("  Hello\n\nthere  ")).toEqual({ ok: true, body: "Hello\n\nthere" });
  });

  it("refuses nothing, or only spaces and line breaks", () => {
    for (const blank of ["", "   ", "\n \n"]) {
      expect(checkMessageBody(blank)).toEqual({ ok: false, message: "Write something to send." });
    }
  });

  it("allows exactly 4000 characters and refuses one more, counting like the backend (code points)", () => {
    expect(checkMessageBody("a".repeat(4000)).ok).toBe(true);
    expect(checkMessageBody("😀".repeat(4000)).ok).toBe(true); // 4000 code points, 8000 UTF-16 units
    expect(checkMessageBody("a".repeat(4001))).toEqual({
      ok: false,
      message: "This Message has 4,001 characters; the limit is 4,000.",
    });
  });

  it("refuses the NUL character, which cannot be stored", () => {
    expect(checkMessageBody("hel\u0000lo")).toEqual({
      ok: false,
      message: "This Message contains a character that cannot be sent. Remove it and try again.",
    });
  });
});
