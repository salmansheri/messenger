"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toProblem, type ConversationResponse } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { MessageView } from "@/features/messages/message-view";
import { targetFrom } from "@/features/messages/window";
import { GroupPanel } from "@/features/groups/group-panel";
import { PresenceLine } from "@/features/presence/presence-line";
import { ConversationMenu } from "./conversation-menu";
import { PaneHeader } from "./pane-header";
import { Avatar } from "@/features/people/person-avatar";
import { conversationAvatar, conversationTitle, otherParticipantId, settingsLine } from "./present";
import { useConversationList } from "./queries";

/**
 * One Conversation, found in the list that is already loaded (so opening it asks the server for nothing more). Its
 * Messages come from the server one page at a time (`MessageView`). A Conversation that is not in the list is, as far
 * as the server is concerned, not the person's to see, and gets the same plain answer whether it never existed or is
 * someone else's.
 */
export function ConversationPane() {
  const { id } = useParams<{ id: string }>();
  // `?at=120` opens the Conversation at that Message (a search result) instead of the latest.
  const target = targetFrom(useSearchParams().get("at"));
  const router = useRouter();
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
          <p className="mt-4">
            <Button variant="quiet" onClick={list.retry}>
              Try again
            </Button>
          </p>
        </div>
      </>
    );
  }

  if (list.status === "pending") {
    return (
      <>
        <PaneHeader>Conversation</PaneHeader>
        <p className="px-4 py-6 text-ink-muted sm:px-8" role="status" aria-busy="true">
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

  const avatar = conversationAvatar(conversation, list.myId);
  return (
    <>
      <PaneHeader
        avatar={<Avatar {...avatar} />}
        actions={<ConversationMenu conversation={conversation} />}
        detail={
          <>
            {conversation.type === "GROUP" ? (
              <GroupPanel conversation={conversation} myId={list.myId} />
            ) : (
              <PresenceLine conversationId={conversation.id ?? ""} userId={otherParticipantId(conversation, list.myId)} />
            )}
            <SettingsLine settings={conversation.settings} />
          </>
        }
      >
        {conversationTitle(conversation, list.myId)}
      </PaneHeader>
      <MessageView
        key={conversation.id}
        conversation={conversation}
        myId={list.myId}
        target={target}
        onLeaveTarget={() => router.replace(`/app/c/${conversation.id}`, { scroll: false })}
      />
    </>
  );
}

/** What the person has set for this Conversation (pinned, muted until when, archived), under its name; nothing if nothing is set. */
function SettingsLine({ settings }: { settings: ConversationResponse["settings"] }) {
  const line = settingsLine(settings, new Date());
  return line ? <p className="font-mono text-xs text-ink-muted">{line}</p> : null;
}
