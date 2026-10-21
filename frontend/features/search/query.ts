/** The server's limits on a search query (`@ValidSearchQuery`), counted in characters as people see them. */
const MIN_CHARACTERS = 2;
const MAX_CHARACTERS = 100;

/** What to do with what is typed in the search box. */
export type SearchQueryCheck =
  /** Nothing yet: empty or a single character, which would match nearly everything. No request is made. */
  | { kind: "idle" }
  /** Longer than the server takes; said under the box instead of sending it. */
  | { kind: "too-long"; message: string }
  | { kind: "ready"; q: string };

/**
 * Checks a query the way the server will, so nothing it would refuse is sent: trimmed, NUL characters left out (the
 * server cannot take them), at least 2 and at most 100 characters counted as code points (an emoji is one).
 */
export function checkSearchQuery(typed: string): SearchQueryCheck {
  const q = typed.replaceAll("\u0000", "").trim();
  const length = [...q].length;
  if (length < MIN_CHARACTERS) return { kind: "idle" };
  if (length > MAX_CHARACTERS) return { kind: "too-long", message: `Search for at most ${MAX_CHARACTERS} characters.` };
  return { kind: "ready", q };
}
