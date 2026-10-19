"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { listQueryKey, sdk, toProblem, type ConversationResponse } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { formatClock } from "@/features/conversations/present";
import { useFrontier } from "@/features/receipts/queries";
import { statusFor, type Frontier } from "@/features/receipts/status";
import { Composer } from "./composer";
import { createOutbox } from "./outbox";
import { addMessageToHistory, useMessageHistory } from "./queries";
import { useReportReading } from "./use-report-reading";
import { buildTimeline, confirmedMessages, firstUnreadSeq, type TimelineItem } from "./timeline";

/** Within this many pixels of the bottom, the view follows new Messages. */
const NEAR_BOTTOM_PX = 80;
/** Further than this from the bottom, "Jump to latest" shows. */
const AWAY_FROM_BOTTOM_PX = 240;
/** Closer than this to the top, older Messages are asked for. */
const NEAR_TOP_PX = 120;

const distanceFromBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight;

/** How many of the newest Messages to ask for first: the usual page, or enough to reach the first unread one. */
const firstPageFor = (unread: number) => Math.min(100, Math.max(50, unread + 10));

type Props = { conversation: ConversationResponse; myId: string | undefined };

/**
 * One Conversation's Messages and the box to write in. Newest at the bottom; it opens on the first unread Message or,
 * when caught up, the bottom; older Messages load as the person scrolls up without moving what they are reading; a
 * control to jump to the latest shows when they are away from the bottom. Used with `key={conversation.id}`.
 */
export function MessageView({ conversation, myId }: Props) {
  const conversationId = conversation.id ?? "";
  const queryClient = useQueryClient();
  // Taken once when the Conversation opens: sending or reading changes the list's numbers, not where this view started.
  const [openedAt] = useState(() => ({ firstUnread: firstUnreadSeq(conversation), unread: conversation.unreadCount ?? 0 }));
  const history = useMessageHistory(conversationId, firstPageFor(openedAt.unread));

  const frontier = useFrontier(conversationId);

  const [outbox] = useState(() =>
    createOutbox({
      send: async (clientMessageId, body) => (await sdk.send({ path: { conversationId }, body: { clientMessageId, body } })).data,
      onSent: (message) => {
        addMessageToHistory(queryClient, message);
        void queryClient.invalidateQueries({ queryKey: listQueryKey() });
      },
    }),
  );
  const pending = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);

  const items = useMemo(
    () =>
      buildTimeline({
        confirmed: confirmedMessages(history.data?.pages ?? []),
        pending,
        myId,
        firstUnreadSeq: openedAt.firstUnread,
        now: new Date(),
      }),
    [history.data, pending, myId, openedAt.firstUnread],
  );

  const names = useMemo(
    () => new Map(conversation.participants?.map((participant) => [participant.userId, participant.displayName]) ?? []),
    [conversation.participants],
  );

  const scroller = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const keepAtBottom = useRef(true);
  const anchor = useRef<{ height: number; firstKey: string | undefined } | null>(null);
  const [away, setAway] = useState(false);

  const firstKey = items.find((item) => item.kind === "message")?.key;

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || firstKey === undefined) return;
    if (!positioned.current) {
      positioned.current = true;
      const unread = element.querySelector("[data-unread-mark]");
      if (unread) unread.scrollIntoView({ block: "start" });
      else if (openedAt.firstUnread !== undefined) element.scrollTop = 0; // the first unread is older than what was loaded
      else element.scrollTop = element.scrollHeight;
      keepAtBottom.current = distanceFromBottom(element) < NEAR_BOTTOM_PX;
      setAway(distanceFromBottom(element) > AWAY_FROM_BOTTOM_PX);
    } else if (anchor.current && anchor.current.firstKey !== firstKey) {
      // Older Messages were added above: move down by what was added, so the Message being read stays where it was.
      element.scrollTop += element.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (keepAtBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [items, firstKey, openedAt.firstUnread]);

  useReportReading(scroller, conversationId, items);

  const { fetchNextPage } = history;
  const olderAvailable = history.hasNextPage && !history.isFetchingNextPage;

  /** Asks for the next page of older Messages, remembering the height so the reading position can be kept. */
  const loadOlder = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    anchor.current = { height: element.scrollHeight, firstKey };
    void fetchNextPage().then((result) => {
      if (result.isError) anchor.current = null; // nothing was added, so there is nothing to compensate for
    });
  }, [fetchNextPage, firstKey]);

  function scrolled() {
    const element = scroller.current;
    if (!element) return;
    keepAtBottom.current = distanceFromBottom(element) < NEAR_BOTTOM_PX;
    setAway(distanceFromBottom(element) > AWAY_FROM_BOTTOM_PX);
    if (element.scrollTop < NEAR_TOP_PX && olderAvailable) loadOlder();
  }

  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  // If the pointer was at the top when the first page arrived there may be nothing to scroll, so nothing would ever ask.
  useEffect(() => {
    const element = scroller.current;
    if (element && olderAvailable && element.scrollHeight <= element.clientHeight) loadOlder();
  }, [olderAvailable, loadOlder, items]);

  // Only a failed first load replaces the view; a failed later page leaves what is on screen (and what is unsent) alone.
  if (history.isError && !history.data) {
    return (
      <div className="px-4 py-6 sm:px-8">
        <Notice tone="problem">{messageFor(toProblem(history.error))}</Notice>
        <p className="mt-4">
          <Button variant="quiet" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </p>
      </div>
    );
  }

  if (history.isPending) {
    return (
      <p className="px-4 py-6 text-ink-muted sm:px-8" aria-busy="true">
        Loading Messages…
      </p>
    );
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} onScroll={scrolled} className="min-h-0 flex-1 overflow-y-auto py-4">
          {/* The same height whether or not there is more, so reaching the oldest Message does not move the page. */}
          <div className="flex h-12 items-center justify-center px-4 text-sm sm:px-8">
            {history.hasNextPage ? (
              <Button variant="quiet" busy={history.isFetchingNextPage} onClick={() => olderAvailable && loadOlder()}>
                {history.isFetchingNextPage ? "Loading earlier Messages…" : "Earlier Messages"}
              </Button>
            ) : (
              <span className="text-ink-muted">Start of this Conversation</span>
            )}
          </div>
          {history.isError && (
            <div className="px-4 pb-2 sm:px-8">
              <Notice tone="problem">{messageFor(toProblem(history.error))}</Notice>
            </div>
          )}
          {items.length === 0 ? (
            <p className="px-4 text-ink-muted sm:px-8">No Messages yet. Write the first one below.</p>
          ) : (
            <ol aria-label="Messages">
              {items.map((item) => (
                <Row key={item.key} item={item} names={names} frontier={frontier} onRetry={outbox.retry} />
              ))}
            </ol>
          )}
        </div>
        {away && (
          <Button onClick={jumpToLatest} className="absolute right-4 bottom-4 shadow-sm sm:right-8">
            Jump to latest
          </Button>
        )}
      </div>
      <Composer
        onSend={(body) => {
          keepAtBottom.current = true;
          outbox.submit(body);
        }}
      />
    </>
  );
}

function Row({
  item,
  names,
  frontier,
  onRetry,
}: {
  item: TimelineItem;
  names: Map<string | undefined, string | undefined>;
  frontier: Frontier | undefined;
  onRetry: (clientMessageId: string) => void;
}) {
  if (item.kind === "day") {
    return (
      <li className="px-4 pt-4 pb-2 sm:px-8">
        <h2 className="border-b border-rule pb-1 font-mono text-xs tracking-wide text-ink-muted uppercase">{item.label}</h2>
      </li>
    );
  }
  if (item.kind === "unread") {
    return (
      <li data-unread-mark className="px-4 py-2 sm:px-8">
        <p className="border-t-2 border-accent pt-1 font-mono text-xs tracking-wide text-accent uppercase">Unread</p>
      </li>
    );
  }
  const { mine, pending } = item;
  const sender = mine ? "You" : (names.get(item.senderId) ?? "Someone who left");
  return (
    <li
      data-seq={!mine && item.seq !== undefined ? item.seq : undefined}
      className={`grid grid-cols-[3rem_1fr] gap-x-3 px-4 sm:grid-cols-[3.5rem_1fr] sm:px-8 ${item.startsRun ? "pt-3" : "pt-0.5"}`}
    >
      <div className="flex flex-col items-start gap-0.5 pt-1">
        <time dateTime={item.createdAt} className="font-mono text-xs text-ink-muted">
          {formatClock(item.createdAt)}
        </time>
        {mine && !pending && item.seq !== undefined && <ReceiptMark status={statusFor({ seq: item.seq, status: item.status }, frontier)} />}
      </div>
      <div className={`min-w-0 border-l-2 pl-3 ${mine ? "border-accent" : "border-rule"}`}>
        {item.startsRun && <p className="font-serif text-sm font-semibold">{sender}</p>}
        <p className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{item.body}</p>
        {pending?.status === "sending" && <p className="text-xs text-ink-muted">Sending…</p>}
        {pending?.status === "failed" && (
          <p className="flex flex-wrap items-center gap-x-3 text-sm">
            <span className="text-accent">
              Not sent. {pending.error ? messageFor(toProblem(pending.error)) : ""}
            </span>
            <Button variant="quiet" onClick={() => onRetry(pending.clientMessageId)}>
              Retry
            </Button>
          </p>
        )}
      </div>
    </li>
  );
}

const STATUS_WORDS = { SENT: "Sent", DELIVERED: "Delivered", READ: "Read" } as const;

/** How far a Message of the person's own has got, as dots: one for sent, two for delivered, two in the accent for read. */
function ReceiptMark({ status }: { status: keyof typeof STATUS_WORDS }) {
  return (
    <span
      role="img"
      aria-label={STATUS_WORDS[status]}
      title={STATUS_WORDS[status]}
      className={`font-mono text-xs leading-none tracking-tighter ${status === "READ" ? "text-accent" : "text-ink-muted"}`}
    >
      {status === "SENT" ? "•" : "••"}
    </span>
  );
}
