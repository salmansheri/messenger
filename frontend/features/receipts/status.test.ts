import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import { mergeFrontier, statusFor } from "./status";

const msg = (seq: number, status?: MessageResponse["status"]): MessageResponse => ({ seq, status });

describe("mergeFrontier", () => {
  it("only ever moves forward, so a late or repeated report changes nothing", () => {
    const now = { deliveredUpTo: 5, readUpTo: 3 };
    expect(mergeFrontier(now, { deliveredUpTo: 4, readUpTo: 2 })).toEqual(now);
    expect(mergeFrontier(now, now)).toEqual(now);
    expect(mergeFrontier(now, { deliveredUpTo: 8, readUpTo: 3 })).toEqual({ deliveredUpTo: 8, readUpTo: 3 });
  });

  it("starts from nothing", () => {
    expect(mergeFrontier(undefined, { deliveredUpTo: 2, readUpTo: 1 })).toEqual({ deliveredUpTo: 2, readUpTo: 1 });
  });
});

describe("statusFor", () => {
  it("is what the server said when nothing newer is known", () => {
    expect(statusFor(msg(4, "DELIVERED"), undefined)).toBe("DELIVERED");
    expect(statusFor(msg(4), undefined), "a Message with no status has only been sent").toBe("SENT");
  });

  it("follows how far everyone else has got", () => {
    const frontier = { deliveredUpTo: 5, readUpTo: 3 };
    expect(statusFor(msg(2), frontier)).toBe("READ");
    expect(statusFor(msg(3), frontier)).toBe("READ");
    expect(statusFor(msg(4), frontier)).toBe("DELIVERED");
    expect(statusFor(msg(5), frontier)).toBe("DELIVERED");
    expect(statusFor(msg(6), frontier)).toBe("SENT");
  });

  it("never goes backwards: a stale frontier does not lower what the server already reported", () => {
    expect(statusFor(msg(4, "READ"), { deliveredUpTo: 4, readUpTo: 0 })).toBe("READ");
    expect(statusFor(msg(4, "DELIVERED"), { deliveredUpTo: 0, readUpTo: 0 })).toBe("DELIVERED");
  });
});
