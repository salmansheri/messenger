import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { VerifyForm } from "@/features/auth/verify-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Verify your email · ${APP_NAME}` };

export default function VerifyPage() {
  return (
    <AppShell>
      {/* The form reads the address from the query string, which is only known in the browser. */}
      <Suspense fallback={<div className="flex-1" aria-hidden />}>
        <VerifyForm />
      </Suspense>
    </AppShell>
  );
}
