import Link from "next/link";
import type { ReactNode } from "react";

/** The top of the side that is not the index: on a phone a way back to the list, then what this screen is. */
export function PaneHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex items-center gap-3 border-b border-rule px-4 py-4 sm:px-8">
      <Link href="/app" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink md:hidden">
        <span aria-hidden>←</span> Conversations
      </Link>
      <h1 className="min-w-0 truncate font-serif text-xl font-semibold tracking-tight">{children}</h1>
    </header>
  );
}
