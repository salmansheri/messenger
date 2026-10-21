/**
 * Signed file links (ADR 0005): `…/api/v1/files/{key}?expires=…&signature=…`, signed afresh on every response and
 * good for 15 minutes. Pure helpers for deciding whether a link already held is still worth keeping.
 */

/** Links held for less than this much longer count as run out, so a picture is not left to fail a moment after a refresh. */
const LINK_MARGIN_MS = 60_000;

const BASE = "http://x";

/**
 * Whether a signed link has run out (or is about to), read from the `expires` the server put into it (seconds since
 * 1970). A link whose expiry cannot be read counts as run out.
 */
export function linkLapsed(url: string | undefined, now: number): boolean {
  try {
    const expires = Number(new URL(url ?? "", BASE).searchParams.get("expires"));
    return !Number.isFinite(expires) || expires * 1000 - now < LINK_MARGIN_MS;
  } catch {
    return true;
  }
}

/** Whether two signed links point at the same file (the same key; only the expiry and signature differ). */
export function sameFile(a: string, b: string): boolean {
  try {
    const first = new URL(a, BASE);
    const second = new URL(b, BASE);
    return first.origin === second.origin && first.pathname === second.pathname;
  } catch {
    return false;
  }
}
