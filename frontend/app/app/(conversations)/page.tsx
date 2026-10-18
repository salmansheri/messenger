import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Conversations · ${APP_NAME}` };

// Not instant by design: RequireSession (in the layout) renders nothing until the browser knows the session, because the
// access token lives only in memory (docs/adr/0003). Next's instant-navigation check would otherwise report this page
// as "dropped from rendering".
export const instant = false;

/** Beside the index on a desktop, when no Conversation is open. (On a phone the index is the whole screen.) */
export default function NothingOpen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Pick a Conversation</h2>
      <p className="mt-2 max-w-sm text-ink-muted">Choose one from the list, or start a new one with someone you know.</p>
    </div>
  );
}
