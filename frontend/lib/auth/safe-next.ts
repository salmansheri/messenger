const APP = "/app";

/**
 * Where to go after signing in: back to the page the visitor was after, but only if it is a page inside the signed-in
 * app. Anything else (another site, a protocol-relative URL, a sign-in loop, a path with tricks) goes to the app itself,
 * so a crafted link cannot send a freshly signed-in person somewhere else.
 */
export function afterSignInPath(next: string | null | undefined): string {
  if (typeof next !== "string" || next === "") return APP;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return APP;
  const insideApp = next === APP || ["/", "?", "#"].some((separator) => next.startsWith(APP + separator));
  if (!insideApp) return APP;
  const path = next.split(/[?#]/)[0];
  if (path.split("/").some((part) => part === ".." || part === ".")) return APP;
  return next;
}

/** The sign-in page, remembering the page the visitor was trying to reach. */
export function signInPathFor(path: string): string {
  return `/sign-in?next=${encodeURIComponent(path)}`;
}
