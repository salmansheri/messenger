"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { toProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { MessageView } from "@/features/messages/message-view";
import { PaneHeader } from "./pane-header";
import { conversationTitle } from "./present";
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
  if (!conversation) {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <div className="px-4 py-6 sm:px-8">
          <Notice tone="problem">This Conversation was not found.</Notice>
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
      <PaneHeader>{conversationTitle(conversation, list.myId)}</PaneHeader>
      <MessageView key={conversation.id} conversation={conversation} myId={list.myId} />
    </>
  );
}
