import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Choose a new password · ${APP_NAME}` };

export default function ResetPasswordPage() {
  return (
    <AppShell>
      <ResetPasswordForm />
    </AppShell>
  );
}
