"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { listQueryKey, sdk, toProblem, type ConversationResponse, type MessageResponse, type ReplyQuote } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { useFrontier } from "@/features/receipts/queries";
import type { Frontier } from "@/features/receipts/status";
import { BlockedNotice } from "@/features/conversations/blocked-notice";
import { AvailabilityLine } from "@/features/presence/availability-line";
import { TypingLine } from "@/features/presence/typing-line";
import { createTypingSender } from "@/features/presence/typing-sender";
import { useTypingPublisher } from "@/features/realtime/realtime-provider";
import { catchUpHistory, refreshHistory } from "./catch-up";
import type { History } from "./history";
import { Composer } from "./composer";
import { createOutbox } from "./outbox";
import { addMessageToHistory, messagesKey, useMessageHistory } from "./queries";
import { useAnnouncements } from "./use-announcements";
import { MessageRow } from "./message-row";
import { quoteView, replyDraft, replyTarget } from "./quote";
import { useReportReading } from "./use-report-reading";
import { buildTimeline, confirmedMessages, firstUnreadSeq, type TimelineItem } from "./timeline";
import { firstParam, isDetached, readingReportable } from "./window";

/** Within this many pixels of the bottom, the view follows new Messages. */
const NEAR_BOTTOM_PX = 80;
/** Further than this from the bottom, "Jump to latest" shows. */
const AWAY_FROM_BOTTOM_PX = 240;
/** Closer than this to the top, older Messages are asked for (and, in a detached window, to the bottom, newer ones). */
const NEAR_END_PX = 120;

const distanceFromBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight;

/** How many of the newest Messages to ask for first: the usual page, or enough to reach the first unread one. */
const firstPageFor = (unread: number) => Math.min(100, Math.max(50, unread + 10));

/** How long a Message opened from a search result stays marked. */
const HIGHLIGHT_MS = 2500;

type Props = {
  conversation: ConversationResponse;
  myId: string | undefined;
  /** The Sequence number of a Message to open at (a search result), from the address; the latest when absent. */
  target?: number;
  /** Goes back to the latest: takes `target` out of the address. */
  onLeaveTarget?: () => void;
};

/**
 * One Conversation's Messages and the box to write in. Newest at the bottom; it opens on the first unread Message or,
 * when caught up, the bottom; older Messages load as the person scrolls up without moving what they are reading; a
 * control to jump to the latest shows when they are away from the bottom. With a `target` it opens instead on that
 * Message, centred, focused and briefly marked, in a window that may be detached from the latest (`window.ts`): it then
 * pages forward too, takes no live Messages, reports no reading, and "Jump to latest" goes back to the newest Messages.
 * Used with `key={conversation.id}`.
 */
export function MessageView({ conversation, myId, target, onLeaveTarget }: Props) {
  const conversationId = conversation.id ?? "";
  const queryClient = useQueryClient();
  // Taken once when the Conversation opens: sending or reading changes the list's numbers, not where this view started.
  const [openedAt] = useState(() => ({ firstUnread: firstUnreadSeq(conversation), unread: conversation.unreadCount ?? 0 }));
  const history = useMessageHistory(conversationId, firstPageFor(openedAt.unread), target);
  const detached = history.data !== undefined && isDetached(history.data);

  const frontier = useFrontier(conversationId);

  // What this person types is shared with the others (a start every few seconds at most, a stop when they stop or send).
  const publishTyping = useTypingPublisher(conversationId);
  const typingSender = useMemo(() => createTypingSender({ publish: publishTyping }), [publishTyping]);
  useEffect(() => () => typingSender.stop(), [typingSender]);
  // A Block takes the composer away mid-sentence: stop telling the other person that someone is typing.
  useEffect(() => {
    if (conversation.blocked) typingSender.stop();
  }, [conversation.blocked, typingSender]);

  const [outbox] = useState(() =>
    createOutbox({
      upload: async (file) => (await sdk.upload({ body: { file } })).data as { id: string },
      send: async (clientMessageId, body, replyToMessageId, attachmentId) =>
        (await sdk.send({ path: { conversationId }, body: { clientMessageId, body, replyToMessageId, attachmentId } })).data,
      release: (previewUrl) => URL.revokeObjectURL(previewUrl),
      onSent: (message) => {
        addMessageToHistory(queryClient, message);
        void queryClient.invalidateQueries({ queryKey: listQueryKey() });
      },
    }),
  );
  const pending = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);

  const confirmed = useMemo(() => confirmedMessages(history.data?.pages ?? []), [history.data]);
  const items = useMemo(
    () =>
      buildTimeline({
        confirmed,
        // A detached window ends before the latest, so unsent Messages (which belong after it) wait until it attaches.
        pending: detached ? [] : pending,
        myId,
        firstUnreadSeq: openedAt.firstUnread,
        now: new Date(),
      }),
    [confirmed, pending, detached, myId, openedAt.firstUnread],
  );

  const names = useMemo(
    () => new Map(conversation.participants?.map((participant) => [participant.userId, participant.displayName]) ?? []),
    [conversation.participants],
  );
  const avatars = useMemo(
    () => new Map(conversation.participants?.map((participant) => [participant.userId, participant.avatarUrl]) ?? []),
    [conversation.participants],
  );

  const spoken = useAnnouncements(confirmed, history.data !== undefined, myId, (id) => names.get(id) ?? "Someone", detached);

  // Replying: the Message the person chose to answer, shown above the box. It is dropped if that Message is deleted
  // meanwhile (the server would refuse the reply), and sent along with the next Message otherwise.
  const byId = useMemo(() => new Map(confirmed.map((message) => [message.id, message])), [confirmed]);
  const loaded = useCallback((messageId: string | undefined) => (messageId ? byId.get(messageId) : undefined), [byId]);
  const [chosen, setChosen] = useState<ReplyQuote>();
  const reply = replyTarget(chosen, loaded);
  const composer = useRef<HTMLTextAreaElement>(null);
  // Unblocking from the notice that takes the composer's place puts focus in the composer once it is back.
  const focusComposer = useRef(false);
  useLayoutEffect(() => {
    if (!conversation.blocked && focusComposer.current) {
      focusComposer.current = false;
      composer.current?.focus();
    }
  }, [conversation.blocked]);
  const nameOf = useCallback((id: string | undefined) => (id === myId ? "You" : (names.get(id) ?? "Someone who left")), [myId, names]);
  const replyStrip = (() => {
    if (!reply) return undefined;
    const view = quoteView(reply, loaded, nameOf);
    return view.kind === "text" ? { sender: view.sender, text: view.text } : undefined;
  })();

  // An image whose link has run out asks for fresh ones; every image that fails at once shares one fetch of the history.
  const refreshing = useRef<Promise<void>>(undefined);
  const refreshLinks = useCallback(() => {
    refreshing.current ??= refreshHistory(queryClient, conversationId, { replaceLinks: true }).finally(() => {
      refreshing.current = undefined;
    });
    return refreshing.current;
  }, [queryClient, conversationId]);

  const scroller = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const keepAtBottom = useRef(true);
  const anchor = useRef<{ height: number; firstKey: string | undefined } | null>(null);
  /** The next positioning goes to the bottom: the person left a window for the latest. */
  const landAtLatest = useRef(false);
  const [away, setAway] = useState(false);
  const [highlighted, setHighlighted] = useState<string>();

  // A different target in the address (another search result, or none: back to the latest) starts the history again
  // from it. Its first page is fetched here and put in place in one step, so what is on screen (and the box being typed
  // in) stays until the new Messages are there; only if that fails is the query reset, showing its own loading and
  // error states. A history that already holds the newest Messages just goes to the bottom.
  const shownTarget = useRef(target);
  useEffect(() => {
    if (shownTarget.current === target) return;
    shownTarget.current = target;
    const key = messagesKey(conversationId);
    const current = queryClient.getQueryData<History>(key);
    if (target === undefined && current && !isDetached(current)) {
      keepAtBottom.current = true;
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
      composer.current?.focus();
      return;
    }
    const param = firstParam(conversationId, target, firstPageFor(openedAt.unread));
    let active = true;
    void (async () => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      try {
        const { data } = await sdk.history_(param);
        if (!active) return;
        positioned.current = false;
        anchor.current = null;
        landAtLatest.current = target === undefined;
        queryClient.setQueryData<History>(key, { pages: [data], pageParams: [param] });
      } catch {
        if (active) void queryClient.resetQueries({ queryKey: key, exact: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [target, queryClient, conversationId, openedAt.unread]);

  // Messages that arrived while a window was detached are fetched once it reaches the newest (a page forward, or the
  // newest page put in place above): one stored just after that page was read would otherwise be missed.
  const wasDetached = useRef(detached);
  useEffect(() => {
    if (wasDetached.current && !detached) void catchUpHistory(queryClient, conversationId);
    wasDetached.current = detached;
  }, [detached, queryClient, conversationId]);

  // The mark on the Message opened at fades after a moment.
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(undefined), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  /** Goes to a loaded Message (a quote's button), leaving the view where it lands rather than snapping back to the bottom. */
  const jumpTo = useCallback((messageId: string) => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!target) return;
    keepAtBottom.current = false;
    target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
  }, []);

  function startReply(messageId: string) {
    const message = loaded(messageId);
    if (!message || message.deletedAt) return;
    setChosen(replyDraft(message));
    composer.current?.focus();
  }

  const firstKey = items.find((item) => item.kind === "message")?.key;

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || firstKey === undefined) return;
    if (!positioned.current && target !== undefined) {
      positioned.current = true;
      // The Message itself, or where it would be when it is not shown (hidden, or from before the person joined).
      const rows = [...element.querySelectorAll<HTMLElement>("[data-message-seq]")];
      const landing = rows.find((row) => Number(row.dataset.messageSeq) >= target) ?? rows.at(-1);
      landing?.scrollIntoView({ block: "center" });
      landing?.focus({ preventScroll: true });
      if (landing && Number(landing.dataset.messageSeq) === target) setHighlighted(landing.dataset.messageId);
      keepAtBottom.current = false;
      setAway(distanceFromBottom(element) > AWAY_FROM_BOTTOM_PX);
    } else if (!positioned.current && landAtLatest.current) {
      // Back from a window: the latest, where the person can go on (or where what they just sent is).
      positioned.current = true;
      landAtLatest.current = false;
      element.scrollTop = element.scrollHeight;
      keepAtBottom.current = true;
      setAway(false);
      composer.current?.focus();
    } else if (!positioned.current) {
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
  }, [items, firstKey, openedAt.firstUnread, target]);

  useReportReading(
    scroller,
    conversationId,
    items,
    readingReportable({ detached, target, firstUnread: openedAt.firstUnread, oldestLoaded: confirmed[0]?.seq }),
  );

  // One request at a time: a page asked for in one direction would otherwise cancel one under way in the other.
  const { fetchNextPage, fetchPreviousPage } = history;
  const olderAvailable = history.hasNextPage && !history.isFetching;
  const newerAvailable = detached && history.hasPreviousPage && !history.isFetching;

  /** Asks for the next page of newer Messages; they are added below, so what is being read does not move. */
  const loadNewer = useCallback(() => void fetchPreviousPage(), [fetchPreviousPage]);

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
    // A detached window never follows the bottom: what is below it is more history, not the latest.
    keepAtBottom.current = !detached && distanceFromBottom(element) < NEAR_BOTTOM_PX;
    setAway(distanceFromBottom(element) > AWAY_FROM_BOTTOM_PX);
    if (element.scrollTop < NEAR_END_PX && olderAvailable) loadOlder();
    if (distanceFromBottom(element) < NEAR_END_PX && newerAvailable) loadNewer();
  }

  /** Whether going to the latest means leaving a window: the newest Messages are not loaded, or the address opens at one. */
  const inWindow = detached || target !== undefined;

  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;
    if (inWindow) {
      onLeaveTarget?.(); // the address changes, and the effect above goes to the latest
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  // If the pointer was at the top when the first page arrived there may be nothing to scroll, so nothing would ever ask.
  useEffect(() => {
    const element = scroller.current;
    if (element && olderAvailable && element.scrollHeight <= element.clientHeight) loadOlder();
  }, [olderAvailable, loadOlder, items]);

  // The same at the bottom of a detached window that fits on the screen.
  useEffect(() => {
    const element = scroller.current;
    if (element && newerAvailable && element.scrollHeight <= element.clientHeight) loadNewer();
  }, [newerAvailable, loadNewer, items]);

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
      <p className="px-4 py-6 text-ink-muted sm:px-8" role="status" aria-busy="true">
        Loading Messages…
      </p>
    );
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Focusable, so the arrow and page keys can scroll the history even when it holds nothing else to tab to. */}
        <div
          ref={scroller}
          onScroll={scrolled}
          tabIndex={0}
          role="region"
          aria-label="Message history"
          className="min-h-0 flex-1 overflow-y-auto py-4"
        >
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
                <Row
                  key={item.key}
                  item={item}
                  conversationId={conversationId}
                  myId={myId}
                  group={conversation.type === "GROUP"}
                  blocked={Boolean(conversation.blocked)}
                  names={names}
                  avatars={avatars}
                  frontier={frontier}
                  onRetry={outbox.retry}
                  loaded={loaded}
                  onReply={startReply}
                  onJump={jumpTo}
                  onImageExpired={refreshLinks}
                  highlighted={item.kind === "message" && item.messageId !== undefined && item.messageId === highlighted}
                />
              ))}
            </ol>
          )}
          {detached && (
            <div className="flex h-12 items-center justify-center px-4 text-sm sm:px-8">
              <Button variant="quiet" busy={history.isFetchingPreviousPage} onClick={() => newerAvailable && loadNewer()}>
                {history.isFetchingPreviousPage ? "Loading later Messages…" : "Later Messages"}
              </Button>
            </div>
          )}
        </div>
        {(away || detached) && (
          <Button onClick={jumpToLatest} className="absolute right-4 bottom-4 shadow-sm sm:right-8">
            Jump to latest
          </Button>
        )}
      </div>
      <div role="log" aria-label="New Messages" className="sr-only">
        {spoken.map((line) => (
          <p key={`${line.seq}-${line.change ?? "new"}`}>{line.text}</p>
        ))}
      </div>
      <AvailabilityLine conversation={conversation} myId={myId} />
      <TypingLine conversationId={conversationId} names={names} />
      {conversation.blocked ? (
        <BlockedNotice conversation={conversation} myId={myId} onUnblocked={() => {
            focusComposer.current = true;
          }} />
      ) : (
        <Composer
          textareaRef={composer}
          reply={replyStrip}
          onCancelReply={() => {
            setChosen(undefined);
            composer.current?.focus();
          }}
          onTyping={(hasText) => (hasText ? typingSender.keystroke() : typingSender.stop())}
          onSend={(body, image) => {
            keepAtBottom.current = true;
            // A new Message goes after the latest, so a window further back gives way to the newest Messages first.
            if (inWindow) onLeaveTarget?.();
            outbox.submit(body, reply, image);
            setChosen(undefined);
          }}
        />
      )}
    </>
  );
}

function Row({
  item,
  conversationId,
  myId,
  group,
  blocked,
  names,
  avatars,
  frontier,
  onRetry,
  loaded,
  onReply,
  onJump,
  onImageExpired,
  highlighted,
}: {
  item: TimelineItem;
  conversationId: string;
  myId: string | undefined;
  group: boolean;
  blocked: boolean;
  names: Map<string | undefined, string | undefined>;
  avatars: Map<string | undefined, string | undefined>;
  frontier: Frontier | undefined;
  onRetry: (clientMessageId: string) => void;
  loaded: (messageId: string | undefined) => MessageResponse | undefined;
  onReply: (messageId: string) => void;
  onJump: (messageId: string) => void;
  onImageExpired: () => Promise<void>;
  highlighted: boolean;
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
  return (
    <MessageRow
      item={item}
      conversationId={conversationId}
      myId={myId}
      group={group}
      blocked={blocked}
      names={names}
      avatars={avatars}
      frontier={frontier}
      onRetry={onRetry}
      loaded={loaded}
      onReply={onReply}
      onJump={onJump}
      onImageExpired={onImageExpired}
      highlighted={highlighted}
    />
  );
}
