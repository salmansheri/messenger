"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { session } from "@/lib/auth/app-session";
import type { SessionSnapshot } from "@/lib/auth/session";

const LOADING: SessionSnapshot = { status: "loading" };

/** Resumes the session once the page is in the browser: a silent refresh, which the refresh cookie makes possible. */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void session.start();
  }, []);
  return children;
}

/** Whether this tab is signed in; on the server and until the first silent refresh answers it is `loading`. */
export function useSession(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => LOADING);
}
