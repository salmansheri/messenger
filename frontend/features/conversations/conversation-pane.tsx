"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/ui/notice";
import { toProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { MessageView } from "@/features/messages/message-view";
import { ParticipantList } from "@/features/presence/participant-list";
import { PresenceLine } from "@/features/presence/presence-line";
import { PaneHeader } from "./pane-header";
import { conversationTitle, otherParticipantId } from "./present";
import { useConversationList } from "./queries";

/**
 * One Conversation, found in the list that is already loaded (so opening it asks the server for nothing more). Its
 * Messages come from the server one page at a time (`MessageView`). A Conversation that is not in the list is, as far
 * as the server is concerned, not the person's to see, and gets the same plain answer whether it never existed or is
 * someone else's.
 */
export function ConversationPane() {
  const { id } = useParams<{ id: string }>();
  const list = useConversationList();
  // Which Conversation this screen has already shown, so one that then disappears from the list (the person was removed
  // or left) can be told apart from an address that never was theirs.
  const [shownId, setShownId] = useState<string>();

  if (list.status === "error") {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <div className="px-4 py-6 sm:px-8">
          <Notice tone="problem">{messageFor(toProblem(list.error))}</Notice>
        </div>
      </>
    );
  }

  if (list.status === "pending") {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <p className="px-4 py-6 text-ink-muted sm:px-8" aria-busy="true">
          Loading…
        </p>
      </>
    );
  }

  const conversation = list.items.find((candidate) => candidate.id === id);
  if (conversation && shownId !== id) setShownId(id);
  if (!conversation) {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <div className="px-4 py-6 sm:px-8">
          <Notice tone="problem">
            {shownId === id ? "You are no longer part of this Conversation." : "This Conversation was not found."}
          </Notice>
          <p className="mt-4 text-sm">
            <Link href="/app" className="underline underline-offset-4">
              Back to your Conversations
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PaneHeader
        detail={
          conversation.type === "GROUP" ? (
            <ParticipantList conversation={conversation} myId={list.myId} />
          ) : (
            <PresenceLine conversationId={conversation.id ?? ""} userId={otherParticipantId(conversation, list.myId)} />
          )
        }
      >
        {conversationTitle(conversation, list.myId)}
      </PaneHeader>
      <MessageView key={conversation.id} conversation={conversation} myId={list.myId} />
    </>
  );
}
