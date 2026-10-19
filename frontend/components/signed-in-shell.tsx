import Link from "next/link";
import type { ReactNode } from "react";
import { ConnectionNotice } from "@/features/realtime/connection-notice";
import { APP_NAME } from "@/lib/app-name";
import { SkipLink } from "./skip-link";
import { ThemeSwitch } from "./theme-switch";

/** The frame around every signed-in screen: the name (home), the settings link and the theme switch. */
export function SignedInShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <SkipLink />
      <header className="flex items-center justify-between gap-4 border-b border-rule px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <Link href="/app" className="font-serif text-xl font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <ConnectionNotice />
        </div>
        <nav aria-label="Account" className="flex items-center gap-4">
          <Link href="/app/settings" className="text-sm underline-offset-4 hover:underline">
            Settings
          </Link>
          <ThemeSwitch />
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none">{children}</main>
    </div>
  );
}
