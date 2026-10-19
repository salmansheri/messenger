"use client";

import type { ConversationResponse } from "@/lib/api";
import { OnlineDot } from "./online-dot";
import { presenceText } from "./text";
import { usePresence } from "./use-presence";

/** A Group's Participants (admins first, as the server lists them) with who is online and when the rest were last seen. */
export function ParticipantList({ conversation, myId }: { conversation: ConversationResponse; myId: string | undefined }) {
  const presence = usePresence(conversation.id ?? "");
  const participants = conversation.participants ?? [];
  const now = new Date();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-muted underline-offset-4 hover:underline">
        Participants ({participants.length})
      </summary>
      <ul aria-label="Participants" className="mt-2 flex flex-col gap-1.5">
        {participants.map((participant) => {
          const mine = participant.userId === myId;
          const view = presence.data?.find((candidate) => candidate.userId === participant.userId);
          return (
            <li key={participant.userId} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-serif font-semibold">
                {participant.displayName}
                {mine ? " (you)" : ""}
              </span>
              {participant.role === "ADMIN" && <span className="font-mono text-xs text-ink-muted uppercase">Admin</span>}
              {!mine && (
                <span className="flex items-center gap-1.5 text-ink-muted">
                  {view?.online && <OnlineDot />}
                  {presenceText(view, now)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
