import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app-name";
import { SkipLink } from "./skip-link";
import { ThemeSwitch } from "./theme-switch";

/** The frame around every screen: a slim header with the name and theme switch, then the page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="flex items-center justify-between gap-4 border-b border-rule px-4 py-3 sm:px-6">
        <span className="font-serif text-xl font-semibold tracking-tight">{APP_NAME}</span>
        <ThemeSwitch />
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">{children}</main>
    </div>
  );
}
