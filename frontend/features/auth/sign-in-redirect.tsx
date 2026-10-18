"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { RedirectIfSignedIn } from "@/features/session/redirect-if-signed-in";
import { afterSignInPath } from "@/lib/auth/safe-next";

/** Sends someone who is (or has just become) signed in to the page they were after, or the app. */
export function SignInRedirect({ children }: { children: ReactNode }) {
  const next = useSearchParams().get("next");
  return <RedirectIfSignedIn to={afterSignInPath(next)}>{children}</RedirectIfSignedIn>;
}
