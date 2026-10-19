"use client";

import { OnlineDot } from "./online-dot";
import { presenceText } from "./text";
import { usePresence } from "./use-presence";

/** Whether the other person in a Direct conversation is online (a dot and "Online"), or when they were last seen. */
export function PresenceLine({ conversationId, userId }: { conversationId: string; userId: string | undefined }) {
  const presence = usePresence(conversationId);
  const view = presence.data?.find((candidate) => candidate.userId === userId);
  return (
    <p className="flex min-h-5 items-center gap-2 text-sm text-ink-muted" data-presence={view ? (view.online ? "online" : "offline") : undefined}>
      {view?.online && <OnlineDot />}
      {presenceText(view, new Date())}
    </p>
  );
}
