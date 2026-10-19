"use client";

import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { useSession } from "@/features/session/session-provider";

/**
 * The ways in: create an account or sign in, or, for someone who already is signed in, straight on to their
 * Conversations. A visitor is shown the first two until the silent sign-in check says otherwise.
 */
export function AccountLinks({ size = "regular" }: { size?: "regular" | "large" }) {
  const session = useSession();
  const big = size === "large" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm";
  if (session.status === "signedIn") {
    return (
      <Link href="/app" className={`${buttonStyles("primary")} ${big}`}>
        Open Messenger
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Link href="/sign-up" className={`${buttonStyles("primary")} ${big}`}>
        Create an account
      </Link>
      <Link
        href="/sign-in"
        className={`text-base underline underline-offset-4 decoration-rule hover:decoration-ink ${size === "large" ? "" : "text-sm"}`}
      >
        Sign in
      </Link>
    </div>
  );
}
