import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import { isNewerVersion, mergeVersion } from "./versions";

const base: MessageResponse = { id: "m1", seq: 1, body: "one" };
const edited = (at: string, body = "two"): MessageResponse => ({ ...base, body, editedAt: at });
const deleted = (at: string): MessageResponse => ({ id: "m1", seq: 1, deletedAt: at });

describe("isNewerVersion", () => {
  it("takes an edit over the original and a later edit over an earlier one", () => {
    expect(isNewerVersion(base, edited("2026-03-10T10:00:00Z"))).toBe(true);
    expect(isNewerVersion(edited("2026-03-10T10:00:00Z"), edited("2026-03-10T10:05:00Z"))).toBe(true);
  });

  it("never goes back to an older edit or to the original", () => {
    expect(isNewerVersion(edited("2026-03-10T10:05:00Z"), edited("2026-03-10T10:00:00Z"))).toBe(false);
    expect(isNewerVersion(edited("2026-03-10T10:00:00Z"), base)).toBe(false);
  });

  it("takes a deletion over anything and never revives a deleted Message", () => {
    expect(isNewerVersion(base, deleted("2026-03-10T10:00:00Z"))).toBe(true);
    expect(isNewerVersion(edited("2026-03-10T10:05:00Z"), deleted("2026-03-10T10:00:00Z"))).toBe(true);
    expect(isNewerVersion(deleted("2026-03-10T10:00:00Z"), edited("2026-03-10T10:09:00Z"))).toBe(false);
    expect(isNewerVersion(deleted("2026-03-10T10:00:00Z"), base)).toBe(false);
  });

  it("is not newer when it is the same version again", () => {
    expect(isNewerVersion(edited("2026-03-10T10:00:00Z"), edited("2026-03-10T10:00:00Z"))).toBe(false);
    expect(isNewerVersion(deleted("2026-03-10T10:00:00Z"), deleted("2026-03-10T10:30:00Z"))).toBe(false);
  });
});

describe("mergeVersion", () => {
  it("keeps the sender's own status, which an event never carries", () => {
    const known: MessageResponse = { ...base, status: "DELIVERED" };

    expect(mergeVersion(known, edited("2026-03-10T10:00:00Z"))).toEqual({ ...edited("2026-03-10T10:00:00Z"), status: "DELIVERED" });
  });

  it("gives back the known Message when the incoming one is not newer", () => {
    const known = edited("2026-03-10T10:05:00Z");

    expect(mergeVersion(known, edited("2026-03-10T10:00:00Z"))).toBe(known);
  });
});
