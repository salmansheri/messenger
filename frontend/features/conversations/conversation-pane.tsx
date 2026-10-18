"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { toProblem } from "@/lib/api";
import { messageFor } from "@/features/auth/wording";
import { useMe } from "@/features/session/use-me";
import { PaneHeader } from "./pane-header";
import { conversationTitle } from "./present";
import { useConversations } from "./queries";

/**
 * One Conversation, found in the list that is already loaded (so opening it asks the server for nothing more). Its
 * Messages arrive with the next ticket. A Conversation that is not in the list is, as far as the server is concerned,
 * not the person's to see, and gets the same plain answer whether it never existed or is someone else's.
 */
export function ConversationPane() {
  const { id } = useParams<{ id: string }>();
  const conversations = useConversations();
  const me = useMe();
  const conversation = conversations.data?.find((candidate) => candidate.id === id);

  if (conversations.isError) {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <div className="px-4 py-6 sm:px-8">
          <Notice tone="problem">{messageFor(toProblem(conversations.error))}</Notice>
        </div>
      </>
    );
  }

  if (!conversations.data || !me.data) {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <p className="px-4 py-6 text-ink-muted sm:px-8" aria-busy="true">
          Loading…
        </p>
      </>
    );
  }

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
      <PaneHeader>{conversationTitle(conversation, me.data.id)}</PaneHeader>
      <div className="px-4 py-6 text-ink-muted sm:px-8">
        <p>Reading and sending Messages is coming next.</p>
      </div>
    </>
  );
}
