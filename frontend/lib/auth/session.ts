import { singleFlight } from "./single-flight";

export type Tokens = { accessToken: string; expiresInSeconds: number };

/**
 * `loading`: the first silent refresh has not answered yet. For `signedOut`, `ended` says a session that existed has
 * ended on its own (it could not be renewed) and `left` says the person chose to sign out; a plain visitor who was
 * never signed in has neither.
 */
export type SessionSnapshot =
  | { status: "loading" }
  | { status: "signedIn" }
  | { status: "signedOut"; ended: boolean; left: boolean };

const RENEW_BEFORE_MS = 60_000;

/** When to renew: a minute before the token runs out, or after 80% of its life if it lives less than two minutes. */
export function renewalDelayMs(expiresInSeconds: number): number {
  const lifetime = expiresInSeconds * 1000;
  const delay = lifetime > 2 * RENEW_BEFORE_MS ? lifetime - RENEW_BEFORE_MS : lifetime * 0.8;
  return Math.max(1_000, delay);
}

/**
 * The signed-in session, kept apart from React so it can be tested alone. The access token lives only in this
 * object's memory. Every refresh (the silent one on load, the timed renewals, anyone else who asks) is the same
 * single in-flight request, and a renewal that fails ends the session.
 */
export function createSession(deps: { requestTokens: () => Promise<Tokens> }) {
  let snapshot: SessionSnapshot = { status: "loading" };
  let accessToken: string | undefined;
  let expiresAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  function publish(next: SessionSnapshot) {
    const same =
      next.status === snapshot.status &&
      (next.status !== "signedOut" ||
        (snapshot.status === "signedOut" && next.ended === snapshot.ended && next.left === snapshot.left));
    if (same) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function forgetTokens() {
    accessToken = undefined;
    expiresAt = 0;
    clearTimeout(timer);
    timer = undefined;
  }

  function signedIn(tokens: Tokens) {
    clearTimeout(timer);
    accessToken = tokens.accessToken;
    expiresAt = Date.now() + tokens.expiresInSeconds * 1000;
    timer = setTimeout(() => void refresh(), renewalDelayMs(tokens.expiresInSeconds));
    publish({ status: "signedIn" });
  }

  const refresh = singleFlight(async () => {
    try {
      signedIn(await deps.requestTokens());
      return true;
    } catch {
      const hadSession = snapshot.status === "signedIn";
      forgetTokens();
      publish({ status: "signedOut", ended: hadSession, left: false });
      return false;
    }
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** The access token to send, or nothing if there is none or it has run out. */
    token: () => (accessToken && Date.now() < expiresAt ? accessToken : undefined),
    /** Takes the tokens from a sign-in. */
    signedIn,
    /** Asks for fresh tokens (all callers at once share one request). Resolves to whether there is a session now. */
    refresh,
    /** The silent refresh when the page loads: resumes the session the refresh cookie belongs to, if any. */
    start: async () => void (await refresh()),
    /** The person chose to sign out. */
    end() {
      forgetTokens();
      publish({ status: "signedOut", ended: false, left: true });
    },
  };
}

export type Session = ReturnType<typeof createSession>;
