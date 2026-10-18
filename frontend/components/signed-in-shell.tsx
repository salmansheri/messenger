import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app-name";
import { ThemeSwitch } from "./theme-switch";

/** The frame around every signed-in screen: the name (home), the settings link and the theme switch. */
export function SignedInShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-rule px-4 py-3 sm:px-6">
        <Link href="/app" className="font-serif text-xl font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <nav aria-label="Account" className="flex items-center gap-4">
          <Link href="/app/settings" className="text-sm underline-offset-4 hover:underline">
            Settings
          </Link>
          <ThemeSwitch />
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
