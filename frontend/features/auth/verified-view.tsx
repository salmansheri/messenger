"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { buttonStyles } from "@/components/ui/button";
import { AuthCard } from "./auth-card";

/** Shown once the address is verified; the heading takes focus so a screen reader announces the change. */
export function VerifiedView() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <AuthCard
      headingRef={heading}
      heading="Your address is verified"
      intro="Your account is ready. Sign in to start your first Conversation."
    >
      <Link href="/sign-in" className={buttonStyles("primary")}>
        Continue to sign in
      </Link>
    </AuthCard>
  );
}
