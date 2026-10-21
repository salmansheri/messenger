"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { nextMenuIndex } from "@/components/ui/menu-keys";
import { toProblem, type ConversationResponse } from "@/lib/api";
import { useSettled } from "@/lib/use-settled";
import { checkSearchQuery } from "./query";
import { resultCountText, resultTime, resultsOf, searchFailureMessage } from "./results";
import { parseSnippet } from "./snippet";
import { useConversationSearch } from "./use-conversation-search";

/** How long typing must pause before a search is sent, so each keystroke is not a request (searches are limited). */
const PAUSE_MS = 300;

type Props = {
  conversation: ConversationResponse;
  myId: string | undefined;
  /** What is typed in the box; kept by the caller so closing and opening the search again keeps it. */
  text: string;
  onTextChange: (text: string) => void;
  /** Closes the search (Escape, the Close button) and hands focus back to whatever opened it. */
  onClose: () => void;
  /** A result was chosen (its Sequence number): the Conversation opens at it, so the search makes way. */
  onChoose: (seq: number | undefined) => void;
};

/**
 * Search in the open Conversation: a box (a search starts once typing pauses and the query has 2 characters), what it
 * found newest first with the matched words marked, who said it and when, and 'More results'. Choosing a result opens
 * the Conversation at that Message (`?at=`, see `window.ts`). The count is a `role=status`, so a screen reader hears
 * what was found; failures read calmly with a Try again. The arrow keys move between the box and the results.
 */
export function SearchPanel({ conversation, myId, text, onTextChange, onClose, onChoose }: Props) {
  const conversationId = conversation.id ?? "";
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const boxId = useId();

  useEffect(() => box.current?.focus(), []);

  const check = checkSearchQuery(text);
  const ready = check.kind === "ready" ? check.q : undefined;
  // What was typed once typing paused; while the next query is being typed, the last one's results stay on screen.
  const settled = useSettled(ready, PAUSE_MS);
  const q = ready === undefined ? undefined : settled;
  const search = useConversationSearch(conversationId, q);
  const results = resultsOf(search.data?.pages);
  const names = new Map(conversation.participants?.map((participant) => [participant.userId, participant.displayName]) ?? []);
  const now = new Date();

  const status = (() => {
    if (q === undefined) return "";
    if (search.isPending) return "Searching…";
    if (search.isError && !search.data) return "";
    return resultCountText(results.length, Boolean(search.hasNextPage));
  })();

  /**
   * Up and down go through the results (from the box, down goes to the first; up from the first goes back to the box);
   * Escape closes the search, except while an input method is still composing text.
   */
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      onClose();
      return;
    }
    const links = [...(list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const inBox = document.activeElement === box.current;
    if (current < 0 && !(inBox && event.key === "ArrowDown")) return; // only the box and the results move with the arrows
    if (current === 0 && event.key === "ArrowUp") {
      event.preventDefault();
      box.current?.focus();
      return;
    }
    const next = nextMenuIndex(links.length, current, event.key);
    if (next === undefined) return;
    event.preventDefault();
    links[next]?.focus();
  }

  return (
    <section aria-label="Search this Conversation" onKeyDown={keyDown} className="border-b border-rule px-4 py-3 sm:px-8">
      <div className="flex items-center gap-3">
        <label htmlFor={boxId} className="sr-only">
          Search this Conversation
        </label>
        <input
          ref={box}
          id={boxId}
          type="search"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Search Messages"
          autoComplete="off"
          aria-invalid={check.kind === "too-long" || undefined}
          aria-describedby={check.kind === "too-long" ? `${boxId}-problem` : undefined}
          className="min-w-0 flex-1 rounded-sm border border-rule bg-paper px-3 py-2 text-base text-ink placeholder:text-ink-muted"
        />
        <Button variant="quiet" onClick={onClose}>
          Close search
        </Button>
      </div>
      {check.kind === "too-long" && (
        <p id={`${boxId}-problem`} role="alert" className="mt-1 text-sm text-accent">
          {check.message}
        </p>
      )}
      <p role="status" className="mt-2 min-h-5 text-sm text-ink-muted">
        {status}
      </p>
      {search.isError && (
        <div className="mt-2 flex flex-col items-start gap-2">
          <Notice tone="problem">{searchFailureMessage(toProblem(search.error))}</Notice>
          <Button
            variant="quiet"
            busy={search.isFetching}
            onClick={() => void (search.isFetchNextPageError ? search.fetchNextPage() : search.refetch())}
          >
            Try again
          </Button>
        </div>
      )}
      {results.length > 0 && (
        <ul ref={list} aria-label="Search results" className="mt-2 max-h-80 overflow-y-auto">
          {results.map((result) => (
            <li key={result.messageId} className="border-t border-rule first:border-t-0">
              <Link
                href={`/app/c/${conversationId}?at=${result.seq}`}
                onClick={() => onChoose(result.seq)}
                className="block px-2 py-2 hover:bg-surface focus:bg-surface focus-visible:-outline-offset-2"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-serif text-sm font-semibold">
                    {result.senderId === myId ? "You" : (names.get(result.senderId) ?? "Someone who left")}
                  </span>
                  <time dateTime={result.createdAt} className="shrink-0 font-mono text-xs text-ink-muted">
                    {resultTime(result.createdAt, now)}
                  </time>
                </span>
                <span className="mt-0.5 line-clamp-2 text-sm text-ink [overflow-wrap:anywhere]">
                  {parseSnippet(result.snippet).map((part, index) =>
                    part.match ? (
                      <mark key={index} className="rounded-sm bg-band px-0.5 font-semibold text-ink">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={index}>{part.text}</span>
                    ),
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {search.hasNextPage && !search.isError && (
        <div className="mt-2">
          <Button variant="quiet" busy={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
            {search.isFetchingNextPage ? "Loading more results…" : "More results"}
          </Button>
        </div>
      )}
    </section>
  );
}
