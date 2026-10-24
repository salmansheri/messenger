"use client";

import type { ConversationResponse } from "@/lib/api";
import { otherParticipantId } from "@/features/conversations/present";
import { availabilityNotice } from "./text";
import { usePresence } from "./use-presence";

/**
 * "Grace is busy." above the writing box of a Direct conversation, read from its presence so it changes live. Nothing
 * in a Group (its panel shows each person's), and nothing while the Conversation is blocked (a Block hides it). The
 * line is always there and takes no room while empty, so a screen reader hears it appear.
 */
export function AvailabilityLine({ conversation, myId }: { conversation: ConversationResponse; myId: string | undefined }) {
  if (conversation.type !== "DIRECT" || conversation.blocked) return <p role="status" />;
  return <DirectAvailabilityLine conversation={conversation} myId={myId} />;
}

function DirectAvailabilityLine({ conversation, myId }: { conversation: ConversationResponse; myId: string | undefined }) {
  const presence = usePresence(conversation.id ?? "");
  const otherId = otherParticipantId(conversation, myId);
  const name = conversation.participants?.find((participant) => participant.userId === otherId)?.displayName ?? "The other person";
  const view = presence.data?.find((candidate) => candidate.userId === otherId);
  const line = availabilityNotice(name, view?.availability);
  return (
    <p role="status" className={line ? "px-4 pt-2 text-sm text-ink sm:px-8" : undefined}>
      {line}
    </p>
  );
}
