"use client";

import type { ReactNode } from "react";
import type { ConversationResponse, ParticipantSummary } from "@/lib/api";
import { Avatar } from "@/features/people/person-avatar";
import { OnlineDot } from "./online-dot";
import { presenceText } from "./text";
import { usePresence } from "./use-presence";

/** A Group's Participants (admins first, as the server lists them) with who is online and when the rest were last seen, and optional buttons per person. */
export function ParticipantList({
  conversation,
  myId,
  actions,
}: {
  conversation: ConversationResponse;
  myId: string | undefined;
  /** Buttons for one Participant (promote, remove): only given to an Admin, and never for oneself. */
  actions?: (participant: ParticipantSummary) => ReactNode;
}) {
  const presence = usePresence(conversation.id ?? "");
  const participants = conversation.participants ?? [];
  const now = new Date();
  return (
    <ul aria-label="Participants" className="flex flex-col gap-2">
      {participants.map((participant) => {
        const mine = participant.userId === myId;
        const view = presence.data?.find((candidate) => candidate.userId === participant.userId);
        return (
          <li key={participant.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Avatar id={participant.userId} name={participant.displayName} url={participant.avatarUrl} size="sm" />
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
            {!mine && actions && <span className="ml-auto flex gap-3">{actions(participant)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
