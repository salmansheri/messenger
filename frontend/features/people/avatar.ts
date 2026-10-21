import { sameFile } from "@/lib/signed-link";

/**
 * What stands in for a person who has no Avatar (or whose picture will not load): their initials on a disc whose
 * colour is always the same for the same person. The colours are design tokens (`--tone-*` in `globals.css`), defined
 * per theme so the initials on them meet WCAG AA.
 */
export const AVATAR_TONES = ["clay", "ochre", "moss", "sea", "slate", "plum"] as const;

export type AvatarTone = (typeof AVATAR_TONES)[number];

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The first character as a person sees it (an emoji made of several code points stays whole), in capitals. */
function firstCharacter(word: string): string {
  const first = graphemes.segment(word)[Symbol.iterator]().next();
  return first.done ? "" : first.value.segment.toLocaleUpperCase();
}

/** The first letter of the first and the last word of a name ("Ada Lovelace" is AL), or a question mark for none. */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return firstCharacter(words[0]);
  return firstCharacter(words[0]) + firstCharacter(words[words.length - 1]);
}

/** The tone of a person's disc, picked from their id (FNV-1a), so it is the same on every screen and every visit. */
export function toneOf(id: string | undefined): AvatarTone {
  let hash = 0x811c9dc5;
  for (const char of id ?? "") {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATAR_TONES[(hash >>> 0) % AVATAR_TONES.length];
}

/**
 * The Avatar link to show, given the one already shown (`held`) and the one just received (`fresh`). Links are signed
 * afresh on every response, so a list refetch hands every person a new address for the same picture; keeping the held
 * one while it points at the same file means the picture is not downloaded again. Its expiry does not matter here: a
 * picture that has loaded stays on screen after its link runs out, and a link that fails to load (`failed`) is never
 * kept. A new picture is a new file, so it is always taken; no fresh link means there is none.
 */
export function heldLink(held: string | undefined, fresh: string | undefined, failed: string | undefined): string | undefined {
  if (!fresh) return undefined;
  if (!held || held === fresh) return fresh;
  return sameFile(held, fresh) && held !== failed ? held : fresh;
}
