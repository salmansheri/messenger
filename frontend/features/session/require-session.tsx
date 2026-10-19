"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { signInPathFor } from "@/lib/auth/safe-next";
import { useSession } from "./session-provider";

/** Signed-in pages only: a visitor who is not signed in is sent to sign-in and brought back afterwards. */
export function RequireSession({ children }: { children: ReactNode }) {
  const state = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "signedOut") return;
    // Someone who just chose to sign out is not sent back to this page when they sign in again.
    router.replace(state.left ? "/sign-in" : signInPathFor(pathname));
  }, [state, pathname, router]);

  if (state.status === "loading") {
    // Nothing to see yet, but a screen reader should not meet a blank page.
    return (
      <p role="status" className="sr-only">
        Checking that you are signed in…
      </p>
    );
  }
  return state.status === "signedIn" ? children : null;
}
