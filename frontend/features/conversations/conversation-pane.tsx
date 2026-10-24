"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toProblem, type ConversationResponse } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { MessageView } from "@/features/messages/message-view";
import { focusMessageRow } from "@/features/messages/focus-row";
import { targetFrom } from "@/features/messages/window";
import { SearchPanel } from "@/features/search/search-panel";
import { SearchToggle } from "@/features/search/search-toggle";
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
  // Search in this Conversation: open or not, and what is typed (kept while it is closed, so opening it again shows
  // the same results); both start afresh for another Conversation.
  const [search, setSearch] = useState({ id, open: false, text: "" });
  if (search.id !== id) setSearch({ id, open: false, text: "" });
  const searchButton = useRef<HTMLButtonElement>(null);
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
        actions={
          <div className="flex items-center gap-1">
            <SearchToggle
              ref={searchButton}
              open={search.open}
              onToggle={() => setSearch((state) => ({ ...state, open: !state.open }))}
            />
            <ConversationMenu conversation={conversation} myId={list.myId} />
          </div>
        }
        detail={
          <>
            {conversation.type === "GROUP" ? (
              <GroupPanel conversation={conversation} myId={list.myId} />
            ) : conversation.blocked ? null : (
              // A Block hides presence both ways, so there is nothing to show while it lasts.
              <PresenceLine conversationId={conversation.id ?? ""} userId={otherParticipantId(conversation, list.myId)} />
            )}
            <SettingsLine settings={conversation.settings} />
          </>
        }
      >
        {conversationTitle(conversation, list.myId)}
      </PaneHeader>
      {search.open && (
        <SearchPanel
          scope={{ kind: "conversation", conversation }}
          myId={list.myId}
          text={search.text}
          onTextChange={(text) => setSearch((state) => ({ ...state, text }))}
          onClose={() => {
            setSearch((state) => ({ ...state, open: false }));
            searchButton.current?.focus();
          }}
          onChoose={({ seq }) => {
            setSearch((state) => ({ ...state, open: false }));
            // The chosen link goes with the search: focus waits on the search button until the Message view puts it on
            // the row it opens at. Choosing the Message already opened at changes no address, so its row is found here.
            searchButton.current?.focus();
            if (seq !== undefined && seq === target) focusMessageRow(seq);
          }}
        />
      )}
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
