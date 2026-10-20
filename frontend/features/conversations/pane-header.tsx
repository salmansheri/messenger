import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The top of the side that is not the index: on a phone a way back to the list, then what this screen is, and
 * optionally a line of detail under it (who is online, a Group's Participants) and, at the far end, controls for the
 * screen (the open Conversation's options).
 */
export function PaneHeader({ children, detail, actions }: { children: ReactNode; detail?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 border-b border-rule px-4 py-4 sm:px-8">
      <Link href="/app" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink md:hidden">
        <span aria-hidden>←</span> Conversations
      </Link>
      <div className="min-w-0">
        <h1 className="truncate font-serif text-xl font-semibold tracking-tight">{children}</h1>
        {detail}
      </div>
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </header>
  );
}
