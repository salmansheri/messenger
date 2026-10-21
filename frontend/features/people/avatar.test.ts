import { describe, expect, it } from "vitest";
import { AVATAR_TONES, heldLink, initialsOf, toneOf } from "./avatar";

describe("initialsOf", () => {
  it("takes the first letter of the first and last word", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("Augusta Ada King")).toBe("AK");
  });

  it("takes one letter from a single word", () => {
    expect(initialsOf("Linus")).toBe("L");
  });

  it("ignores spacing around and between words, and writes letters as capitals", () => {
    expect(initialsOf("  grace   hopper ")).toBe("GH");
    expect(initialsOf("émile zola")).toBe("ÉZ");
  });

  it("keeps a character made of several code points whole", () => {
    expect(initialsOf("🦊 Fox")).toBe("🦊F");
    expect(initialsOf("👩‍💻 Coder")).toBe("👩‍💻C");
  });

  it("shows a question mark when there is no name to take letters from", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf(undefined)).toBe("?");
  });
});

describe("toneOf", () => {
  it("always gives the same person the same tone", () => {
    expect(toneOf("3f1c2a90-0000-4000-8000-000000000001")).toBe(toneOf("3f1c2a90-0000-4000-8000-000000000001"));
  });

  it("gives one of the offered tones, also for an unknown person", () => {
    expect(AVATAR_TONES).toContain(toneOf("anyone"));
    expect(AVATAR_TONES).toContain(toneOf(""));
    expect(AVATAR_TONES).toContain(toneOf(undefined));
  });

  it("spreads people over every tone", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => toneOf(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)));
    expect(seen.size).toBe(AVATAR_TONES.length);
  });

  it("tells apart ids that differ only at the end", () => {
    const tones = ["a", "b", "c", "d", "e", "f"].map((last) => toneOf(`user-${last}`));
    expect(new Set(tones).size).toBeGreaterThan(1);
  });
});

describe("heldLink", () => {
  const NOW = Date.parse("2026-10-21T12:00:00Z");
  const link = (file: string, expiresInSeconds: number, signature = "s") =>
    `http://localhost:8080/api/v1/files/avatars/ada/${file}?expires=${NOW / 1000 + expiresInSeconds}&signature=${signature}`;

  it("keeps the link already shown when a fresh one points at the same picture, so it is not downloaded again", () => {
    const held = link("a.png", 600, "first");
    expect(heldLink(held, link("a.png", 900, "second"), undefined)).toBe(held);
  });

  it("takes the fresh link for a different picture, or when there was none", () => {
    expect(heldLink(link("a.png", 600), link("b.png", 900), undefined)).toBe(link("b.png", 900));
    expect(heldLink(undefined, link("a.png", 900), undefined)).toBe(link("a.png", 900));
  });

  it("keeps a held link even after it ran out: a picture already shown stays shown, and one that fails is replaced", () => {
    const held = link("a.png", -60, "old");
    expect(heldLink(held, link("a.png", 900, "new"), undefined)).toBe(held);
  });

  it("takes the fresh link when the one held failed to load, whatever its expiry says", () => {
    const held = link("a.png", 600, "first");
    expect(heldLink(held, link("a.png", 900, "second"), held)).toBe(link("a.png", 900, "second"));
  });

  it("shows nothing once the picture was removed", () => {
    expect(heldLink(link("a.png", 600), undefined, undefined)).toBeUndefined();
  });

  it("takes the fresh link when the held one cannot be read", () => {
    expect(heldLink("not a link", link("a.png", 900), undefined)).toBe(link("a.png", 900));
  });
});
