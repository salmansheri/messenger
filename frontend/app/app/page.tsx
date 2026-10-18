import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Conversations · ${APP_NAME}` };

/** The Conversation list arrives with the next tickets; this is where signing in lands. */
export default function AppHome() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Conversations</h1>
      <p className="mt-2 text-ink-muted">You have no Conversations yet.</p>
    </div>
  );
}
