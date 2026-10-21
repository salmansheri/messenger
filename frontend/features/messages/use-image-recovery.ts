"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { initialImageState, nextImageState } from "./image-recovery";

/** How long to wait for a fresh link to show up in the screen's data after the fetch for it has finished. */
const SETTLE_MS = 400;

/**
 * Drives one picture through `image-recovery`: a failed load asks `refresh` (the data fetch that brings fresh links)
 * once; the new `src` that results is tried, and if that fails or none arrives the picture is `failed` until
 * `retry`. Without `refresh` (a preview held on this device) a failure is final. `attempt` changes whenever the picture
 * should be loaded again even if its address did not, so it can be used as a React key.
 */
export function useImageRecovery(src: string, refresh: (() => Promise<void>) | undefined) {
  const [state, dispatch] = useReducer(nextImageState, initialImageState);
  const [attempt, setAttempt] = useState(0);
  const failedSrc = useRef<string>(undefined);
  const canRefresh = Boolean(refresh);

  // A different address after a failure is the fresh link, whether it came while still waiting or a little late.
  useEffect(() => {
    if (state.status !== "showing" && src !== failedSrc.current) {
      dispatch({ type: "refreshed", changed: true });
      setAttempt((count) => count + 1);
    }
  }, [src, state.status]);

  // Asking for fresh links happens once per move into "refreshing"; when the fetch is over and no new address showed
  // up in a moment, the picture gives up.
  useEffect(() => {
    if (state.status !== "refreshing" || !refresh) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = true;
    void refresh()
      .catch(() => {}) // a failed fetch just means no fresh link arrives
      .finally(() => {
        if (current) timer = setTimeout(() => dispatch({ type: "refreshed", changed: false }), SETTLE_MS);
      });
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // `refresh` is stable for a Conversation; only a move into "refreshing" should start a fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  return {
    status: state.status,
    attempt,
    onLoad: () => dispatch({ type: "loaded" }),
    onError: () => {
      failedSrc.current = src;
      dispatch({ type: "error", canRefresh });
    },
    retry: () => {
      failedSrc.current = src;
      dispatch({ type: "retry", canRefresh });
      setAttempt((count) => count + 1);
    },
  };
}
