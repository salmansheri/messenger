"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { nextMenuIndex } from "@/components/ui/menu-keys";
import { toProblem, type ConversationResponse, type SearchResult } from "@/lib/api";
import { useSettled } from "@/lib/use-settled";
import { checkSearchQuery } from "./query";
import { groupResults } from "./groups";
import { resultCountText, resultTime, resultsOf, searchFailureMessage } from "./results";
import { parseSnippet } from "./snippet";
import { useMessageSearch } from "./use-message-search";

/** How long typing must pause before a search is sent, so each keystroke is not a request (searches are limited). */
const PAUSE_MS = 300;

/** What to search: the open Conversation, or every Conversation in the loaded list (whose names label the results). */
export type PanelScope = { kind: "conversation"; conversation: ConversationResponse } | { kind: "all"; conversations: ConversationResponse[] };

type Props = {
  scope: PanelScope;
  myId: string | undefined;
  /** What is typed in the box; kept by the caller so closing and opening the search again keeps it. */
  text: string;
  onTextChange: (text: string) => void;
  /** Closes the search (Escape, the Close button) and hands focus back to whatever opened it. */
  onClose: () => void;
  /** A result was chosen: its Conversation opens at it, so the search makes way. */
  onChoose: (result: SearchResult) => void;
};

/**
 * Search in the open Conversation, or across all of them: a box (a search starts once typing pauses and the query has 2
 * characters), what it found newest first with the matched words marked, who said it and when (and, across all, under
 * the name of each Conversation: `groupResults`), and 'More results'. Choosing a result opens its Conversation at that
 * Message (`?at=`, see `window.ts`). The count is a `role=status`, so a screen reader hears what was found; failures read
 * calmly with a Try again. The arrow keys move between the box and the results.
 */
export function SearchPanel({ scope, myId, text, onTextChange, onClose, onChoose }: Props) {
  const label = scope.kind === "all" ? "Search all Conversations" : "Search this Conversation";
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const boxId = useId();

  useEffect(() => box.current?.focus(), []);

  const check = checkSearchQuery(text);
  const ready = check.kind === "ready" ? check.q : undefined;
  // What was typed once typing paused; while the next query is being typed, the last one's results stay on screen.
  const settled = useSettled(ready, PAUSE_MS);
  const q = ready === undefined ? undefined : settled;
  const search = useMessageSearch(
    scope.kind === "all" ? { kind: "all" } : { kind: "conversation", conversationId: scope.conversation.id ?? "" },
    q,
  );
  const results = resultsOf(search.data?.pages);
  const conversations = scope.kind === "all" ? scope.conversations : [scope.conversation];
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
    <section aria-label={label} onKeyDown={keyDown} className="border-b border-rule px-4 py-3 sm:px-8">
      <div className="flex items-center gap-3">
        <label htmlFor={boxId} className="sr-only">
          {label}
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
          <Notice tone="problem">{searchFailureMessage(toProblem(search.error), scope.kind)}</Notice>
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
        <div ref={list} className="mt-2 max-h-80 overflow-y-auto">
          {scope.kind === "conversation" ? (
            <ul aria-label="Search results">
              {results.map((result) => (
                <ResultItem key={result.messageId} result={result} conversations={conversations} myId={myId} now={now} onChoose={onChoose} />
              ))}
            </ul>
          ) : (
            <ul aria-label="Search results">
              {groupResults(results, conversations, myId).map((group) => (
                <li key={group.key} className="mt-2 first:mt-0">
                  <p id={`${boxId}-${group.key}`} className="px-2 font-mono text-xs tracking-wide text-ink-muted uppercase">
                    {group.title}
                  </p>
                  <ul aria-labelledby={`${boxId}-${group.key}`}>
                    {group.results.map((result) => (
                      <ResultItem key={result.messageId} result={result} conversations={conversations} myId={myId} now={now} onChoose={onChoose} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
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

/** One result: who said it in which Conversation and when, and the snippet with the matches marked (text, never HTML). */
function ResultItem({
  result,
  conversations,
  myId,
  now,
  onChoose,
}: {
  result: SearchResult;
  conversations: readonly ConversationResponse[];
  myId: string | undefined;
  now: Date;
  onChoose: (result: SearchResult) => void;
}) {
  const conversation = conversations.find((candidate) => candidate.id === result.conversationId);
  const sender =
    result.senderId === myId
      ? "You"
      : (conversation?.participants?.find((participant) => participant.userId === result.senderId)?.displayName ?? "Someone who left");
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        href={`/app/c/${result.conversationId}?at=${result.seq}`}
        onClick={() => onChoose(result)}
        className="block px-2 py-2 hover:bg-surface focus:bg-surface focus-visible:-outline-offset-2"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-serif text-sm font-semibold">{sender}</span>
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
  );
}
