import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AuthCard } from "@/features/auth/auth-card";
import { SignUpForm } from "@/features/auth/sign-up-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Create your account · ${APP_NAME}` };

export default function SignUpPage() {
  return (
    <AppShell>
      <AuthCard
        heading="Create your account"
        intro="Use your email address. We will send a code to confirm it."
        footer={
          <>
            Already have an account? <Link href="/sign-in" className="underline underline-offset-4">Sign in</Link>
          </>
        }
      >
        <SignUpForm />
      </AuthCard>
    </AppShell>
  );
}
