"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toProblem } from "@/lib/api";
import { messageFor } from "@/features/auth/wording";
import { useMe } from "@/features/session/use-me";
import { conversationTitle, formatWhen, lastLine, unreadLabel } from "./present";
import { useConversations } from "./queries";

/** The list of Conversations: name, latest line, time and unread count, the open one marked. */
export function ConversationIndex() {
  const conversations = useConversations();
  const me = useMe();
  const openPath = usePathname();

  return (
    <nav aria-label="Conversations" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-2 sm:px-6">
        <h1 className="font-serif text-sm tracking-wide text-ink-muted uppercase">Conversations</h1>
        <Link href="/app/new" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
          New
        </Link>
      </div>

      {(conversations.isPending || me.isPending) && !conversations.isError && (
        <p className="px-4 py-6 text-ink-muted sm:px-6" aria-busy="true">
          Loading your Conversations…
        </p>
      )}

      {conversations.isError && (
        <div className="flex flex-col items-start gap-3 px-4 py-4 sm:px-6">
          <Notice tone="problem">{messageFor(toProblem(conversations.error))}</Notice>
          <Button variant="quiet" onClick={() => void conversations.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {conversations.data && me.data && conversations.data.length === 0 && (
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

      {conversations.data && me.data && conversations.data.length > 0 && (
        <ul>
          {conversations.data.map((conversation) => {
            const href = `/app/c/${conversation.id}`;
            const open = openPath === href;
            const unread = unreadLabel(conversation.unreadCount);
            return (
              <li key={conversation.id} className="border-t border-rule">
                <Link
                  href={href}
                  aria-current={open ? "page" : undefined}
                  className={`block border-l-2 px-4 py-3 sm:px-6 ${
                    open ? "border-accent bg-surface" : "border-transparent hover:bg-surface"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-serif text-base font-semibold">
                      {conversationTitle(conversation, me.data.id)}
                    </span>
                    <time dateTime={conversation.lastMessage?.createdAt} className="shrink-0 font-mono text-xs text-ink-muted">
                      {formatWhen(conversation.lastMessage?.createdAt ?? conversation.updatedAt, new Date())}
                    </time>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-ink-muted">{lastLine(conversation, me.data.id)}</span>
                    {unread && (
                      <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-medium text-on-accent">
                        {unread}
                        <span className="sr-only"> unread messages</span>
                      </span>
                    )}
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
