import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthCard } from "@/features/auth/auth-card";
import { SignInForm } from "@/features/auth/sign-in-form";
import { SignInRedirect } from "@/features/auth/sign-in-redirect";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Sign in · ${APP_NAME}` };

export default function SignInPage() {
  return (
    <AppShell>
      <AuthCard heading="Sign in" intro="Welcome back. Use the email address and password you signed up with.">
        {/* The page to return to is in the query string, which is only known in the browser. */}
        <Suspense fallback={<div className="h-64" aria-hidden />}>
          <SignInRedirect>
            <SignInForm />
          </SignInRedirect>
        </Suspense>
      </AuthCard>
    </AppShell>
  );
}
