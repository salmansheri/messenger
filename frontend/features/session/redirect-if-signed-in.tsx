"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "./session-provider";

/** Pages for visitors (sign in, sign up): someone who is already signed in is sent on into the app instead. */
export function RedirectIfSignedIn({ to, children }: { to: string; children: ReactNode }) {
  const state = useSession();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "signedIn") router.replace(to);
  }, [state.status, to, router]);

  return state.status === "signedIn" ? null : children;
}
