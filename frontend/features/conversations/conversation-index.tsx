"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { Avatar } from "@/features/people/person-avatar";
import { SearchPanel } from "@/features/search/search-panel";
import { SearchToggle } from "@/features/search/search-toggle";
import { conversationAvatar, conversationTitle, formatWhen, lastLine, unreadLabel, unreadSpeech } from "./present";
import { useConversationList } from "./queries";
import { archivedHasUnread, isMuted } from "./settings";

/**
 * The list of Conversations: name, latest line, time and unread count, the open one marked, pinned ones first and
 * marked, muted ones marked. Archived Conversations are a view of their own, reached from a button that has a dot when
 * one of them has unread Messages; opening a Conversation shows the view it belongs to. A search across all
 * Conversations opens above the list (what is typed is kept while it is closed).
 */
export function ConversationIndex() {
  const list = useConversationList();
  const openPath = usePathname();
  const items = list.status === "ready" ? list.items : [];
  const openId = openPath.startsWith("/app/c/") ? openPath.slice("/app/c/".length).split("/")[0] : undefined;
  const openIsArchived = Boolean(items.find((conversation) => conversation.id === openId)?.settings?.archived);
  const [view, setView] = useState<"active" | "archived">("active");
  // Opening a different Conversation shows the view it is in (an archived one reached by a link, say). Archiving the
  // open one does not: the row just leaves the list the person is looking at. (State adjusted while rendering, the
  // way React asks for something derived from props.)
  const [followed, setFollowed] = useState<string>();
  if (list.status === "ready" && followed !== (openId ?? "")) {
    setFollowed(openId ?? "");
    if (openId) setView(openIsArchived ? "archived" : "active");
  }
  const archivedCount = items.filter((conversation) => conversation.settings?.archived).length;
  // An Archived view with nothing in it is not worth showing: the last one was unarchived, so go back to the list.
  const showing = view === "archived" && archivedCount === 0 ? "active" : view;
  const shown = items.filter((conversation) => Boolean(conversation.settings?.archived) === (showing === "archived"));
  const now = new Date();
  // One top-level heading per screen: the list's own when nothing is open, the open screen's otherwise.
  const Heading = openPath === "/app" ? "h1" : "h2";
  const [search, setSearch] = useState({ open: false, text: "" });
  const searchButton = useRef<HTMLButtonElement>(null);

  return (
    <nav aria-labelledby="conversations-heading" className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-2 sm:px-6">
        <Heading id="conversations-heading" className="font-serif text-sm tracking-wide text-ink-muted uppercase">
          Conversations
        </Heading>
        <span className="flex items-center gap-2">
          <SearchToggle
            ref={searchButton}
            label="Search all Conversations"
            open={search.open}
            onToggle={() => setSearch((state) => ({ ...state, open: !state.open }))}
          />
          <Link href="/app/new" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
            New
          </Link>
        </span>
      </div>

      {search.open && (
        <SearchPanel
          scope={{ kind: "all", conversations: items }}
          myId={list.status === "ready" ? list.myId : undefined}
          text={search.text}
          onTextChange={(text) => setSearch((state) => ({ ...state, text }))}
          onClose={() => {
            setSearch((state) => ({ ...state, open: false }));
            searchButton.current?.focus();
          }}
          onChoose={() => {
            // The chosen link goes with the search; the Message view then focuses the row it opens at.
            setSearch((state) => ({ ...state, open: false }));
            searchButton.current?.focus();
          }}
        />
      )}

      {list.status === "pending" && (
        <p className="px-4 py-6 text-ink-muted sm:px-6" role="status" aria-busy="true">
          Loading your Conversations…
        </p>
      )}

      {list.status === "error" && (
        <div className="flex flex-col items-start gap-3 px-4 py-4 sm:px-6">
          <Notice tone="problem">{messageFor(toProblem(list.error))}</Notice>
          <Button variant="quiet" onClick={list.retry}>
            Try again
          </Button>
        </div>
      )}

      {list.status === "ready" && archivedCount > 0 && (
        <div className="px-4 pb-2 sm:px-6">
          <Button variant="quiet" className="text-sm" onClick={() => setView(showing === "active" ? "archived" : "active")}>
            {showing === "active" ? (
              <>
                Archived ({archivedCount})
                {archivedHasUnread(items) && (
                  <>
                    <span aria-hidden className="ml-1.5 inline-block size-2 rounded-full bg-accent align-middle" />
                    <span className="sr-only"> has unread Messages</span>
                  </>
                )}
              </>
            ) : (
              "Back to your Conversations"
            )}
          </Button>
        </div>
      )}

      {list.status === "ready" && showing === "archived" && (
        <p className="px-4 pb-2 font-mono text-xs tracking-wide text-ink-muted uppercase sm:px-6">Archived</p>
      )}

      {list.status === "ready" && list.items.length > 0 && shown.length === 0 && (
        <p className="px-4 py-6 text-ink-muted sm:px-6">
          {showing === "archived" ? "Nothing is archived." : "Everything you have is archived."}
        </p>
      )}

      {list.status === "ready" && list.items.length === 0 && (
        <div className="px-4 py-8 sm:px-6">
          <p className="font-serif text-lg font-semibold">You have no Conversations yet.</p>
          <p className="mt-1 text-ink-muted">Start one with someone you know by their email address.</p>
          <Link
            href="/app/new"
            className="mt-4 inline-block text-sm underline underline-offset-4 decoration-rule hover:decoration-ink"
          >
            Start a Conversation
          </Link>
        </div>
      )}

      {list.status === "ready" && shown.length > 0 && (
        <ul>
          {shown.map((conversation) => {
            const href = `/app/c/${conversation.id}`;
            const open = openPath === href;
            const unread = unreadLabel(conversation.unreadCount);
            const pinned = Boolean(conversation.settings?.pinned);
            const muted = isMuted(conversation.settings, now);
            const avatar = conversationAvatar(conversation, list.myId);
            return (
              <li key={conversation.id} className="border-t border-rule">
                <Link
                  href={href}
                  aria-current={open ? "page" : undefined}
                  className={`flex items-center gap-3 border-l-2 px-4 py-3 sm:px-6 ${
                    open ? "border-accent bg-surface" : "border-transparent hover:bg-surface"
                  }`}
                >
                  <Avatar {...avatar} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-serif text-base font-semibold">
                        {conversationTitle(conversation, list.myId)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-ink-muted">
                        {pinned && <PinIcon />}
                        {muted && <MuteIcon />}
                        <time dateTime={conversation.lastMessage?.createdAt} className="font-mono text-xs">
                          {formatWhen(conversation.lastMessage?.createdAt ?? conversation.updatedAt, now)}
                        </time>
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-ink-muted">{lastLine(conversation, list.myId)}</span>
                      {unread && (
                        <span
                          className={`shrink-0 rounded-full px-2 text-xs font-medium ${
                            muted ? "border border-rule text-ink" : "bg-accent text-on-accent"
                          }`}
                        >
                          <span aria-hidden>{unread}</span>
                          <span className="sr-only">{unreadSpeech(conversation.unreadCount)}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

/** A pin, for a Conversation the person has pinned; the words for a screen reader come with it. */
function PinIcon() {
  return (
    <>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 1h6l-1 5 3 3v1.5H8.75V15h-1.5v-4.5H3V9l3-3z" />
      </svg>
      <span className="sr-only">Pinned.</span>
    </>
  );
}

/** A bell with a stroke through it, for a muted Conversation. */
function MuteIcon() {
  return (
    <>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14.5h3M2 2l12 12" />
      </svg>
      <span className="sr-only">Muted.</span>
    </>
  );
}
