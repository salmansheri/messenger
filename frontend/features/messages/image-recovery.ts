/**
 * What happens to a picture on screen whose link may have run out (links last 15 minutes, so a screen left open can
 * hold dead ones). A failed load first asks, once and silently, for fresh links and tries again; only if that fails
 * too does the picture give way to a placeholder with a Retry. Pure, so it can be tested without a browser.
 */
export type ImageState = {
  status: "showing" | "refreshing" | "failed";
  /** Fresh links were already asked for since the picture last loaded, so the next failure is final. */
  refreshed: boolean;
};

export const initialImageState: ImageState = { status: "showing", refreshed: false };

export type ImageAction =
  /** The picture loaded: a later expiry may be recovered from again. */
  | { type: "loaded" }
  /** The picture failed to load; `canRefresh` says whether there is a way to get a fresh link. */
  | { type: "error"; canRefresh: boolean }
  /** The wait for fresh links is over: the picture's link is different now, or it is not. */
  | { type: "refreshed"; changed: boolean }
  /** The person pressed Retry on the placeholder. */
  | { type: "retry"; canRefresh: boolean };

export function nextImageState(state: ImageState, action: ImageAction): ImageState {
  switch (action.type) {
    case "loaded":
      return state.status === "showing" ? { status: "showing", refreshed: false } : state;
    case "error":
      if (state.status !== "showing") return state; // a second report of the same failure
      return !state.refreshed && action.canRefresh ? { status: "refreshing", refreshed: true } : { status: "failed", refreshed: state.refreshed };
    case "refreshed":
      // A fresh link is worth trying whenever it turns up, even after giving up on waiting for it; the news that no
      // fresh link came only matters while still waiting.
      if (action.changed) return state.status === "showing" ? state : { status: "showing", refreshed: true };
      return state.status === "refreshing" ? { status: "failed", refreshed: true } : state;
    case "retry":
      if (state.status !== "failed") return state;
      // One more try with fresh links; if they fail too the placeholder comes back.
      return action.canRefresh ? { status: "refreshing", refreshed: true } : { status: "showing", refreshed: true };
  }
}
