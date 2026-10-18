import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AuthCard } from "@/features/auth/auth-card";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Forgot your password? · ${APP_NAME}` };

export default function ForgotPasswordPage() {
  return (
    <AppShell>
      <AuthCard
        heading="Forgot your password?"
        intro="Enter your email address. If it belongs to an account, we will email you a code to choose a new password."
        footer={
          <>
            Remembered it? <Link href="/sign-in" className="underline underline-offset-4">Sign in</Link>
          </>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </AppShell>
  );
}
