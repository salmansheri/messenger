"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { buttonStyles } from "@/components/ui/button";
import { AuthCard } from "./auth-card";

/** Shown once the password has been changed; the heading takes focus so a screen reader announces the change. */
export function PasswordChangedView() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <AuthCard
      headingRef={heading}
      heading="Your password has been changed"
      intro="Anywhere else you were signed in, you will be asked to sign in again. Sign in here with your new password."
    >
      <Link href="/sign-in" className={buttonStyles("primary")}>
        Continue to sign in
      </Link>
    </AuthCard>
  );
}
