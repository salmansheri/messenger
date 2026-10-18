import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { VerifyForm } from "@/features/auth/verify-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Verify your email · ${APP_NAME}` };

export default function VerifyPage() {
  return (
    <AppShell>
      <VerifyForm />
    </AppShell>
  );
}
