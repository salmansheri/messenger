import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Conversations · ${APP_NAME}` };

// Not instant by design: RequireSession (in the layout) renders nothing until the browser knows the session, because the
// access token lives only in memory (docs/adr/0003). Next's instant-navigation check would otherwise report this page
// as "dropped from rendering".
export const instant = false;

/** The Conversation list arrives with the next tickets; this is where signing in lands. */
export default function AppHome() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Conversations</h1>
      <p className="mt-2 text-ink-muted">You have no Conversations yet.</p>
    </div>
  );
}
