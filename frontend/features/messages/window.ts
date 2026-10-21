import type { MessagePage } from "@/lib/api";
import type { History } from "./history";

/**
 * A Conversation's history is either **attached** (it holds the newest Messages, so live ones join it at the bottom)
 * or **detached**: a window opened around a Message further back (a search result), with newer Messages on the server
 * that are not loaded. A detached history pages both ways and never takes a live Message, which would land after a
 * gap; it becomes attached once a page forward reaches the newest Message. Everything here is decided from the pages
 * and the requests that fetched them, so it is the same however the history was filled.
 */

/** One request for a page of history, as the generated paging options take it. */
export type HistoryParam = {
  path: { conversationId: string };
  query: { limit?: number; beforeSeq?: number; afterSeq?: number; aroundSeq?: number };
};

/** Messages per page when paging back or forward from the first page. */
const PAGE = 50;

/** The first request: the newest `firstPage` Messages, or the window around `target` when opening at a Message. */
export function firstParam(conversationId: string, target: number | undefined, firstPage: number): HistoryParam {
  return { path: { conversationId }, query: target === undefined ? { limit: firstPage } : { aroundSeq: target } };
}

/**
 * The request that fetched a page; one that is not known (a page put in by hand) counts as the newest Messages. Its
 * path is then left out at run time, so the generated paging options use the query key's own (never an empty id).
 */
const asParam = (param: unknown): HistoryParam => {
  const known = param as Partial<HistoryParam> | undefined;
  return { path: known?.path as HistoryParam["path"], query: known?.query ?? {} };
};

/**
 * The request for the Messages before a page, or nothing when there are none. A page of newer Messages (fetched with
 * `afterSeq`) only says whether more newer ones exist, but there is always history before it (the window it continues),
 * which matters when a detached history is fetched again from its first page.
 */
export function olderParam(page: MessagePage, param: unknown): HistoryParam | undefined {
  const { path, query } = asParam(param);
  const oldest = page.messages?.[0]?.seq;
  if (oldest === undefined) return undefined;
  const more = query.afterSeq !== undefined ? true : query.aroundSeq !== undefined ? (page.hasOlder ?? page.hasMore) : page.hasMore;
  return more ? { path, query: { beforeSeq: oldest, limit: PAGE } } : undefined;
}

/** The request for the Messages after a page, or nothing when it reaches the newest (or was never a window). */
export function newerParam(page: MessagePage, param: unknown): HistoryParam | undefined {
  const { path, query } = asParam(param);
  const newest = page.messages?.at(-1)?.seq;
  if (newest === undefined) return undefined;
  const more = query.aroundSeq !== undefined ? page.hasNewer : query.afterSeq !== undefined ? page.hasMore : false;
  return more ? { path, query: { afterSeq: newest, limit: PAGE } } : undefined;
}

/** Whether newer Messages exist on the server than the history holds (its newest page is short of the latest). */
export function isDetached(history: History): boolean {
  const [newest] = history.pages;
  return newest !== undefined && newerParam(newest, history.pageParams[0]) !== undefined;
}

/**
 * What a refresh after a lost connection fetches again: from the oldest Message loaded and, for an attached history, on
 * to the end (anything newer belongs at its bottom); a detached window stops at its own newest Message, so it is never
 * joined to the latest across the gap.
 */
export function refreshBounds(history: History): { from: number | undefined; upTo: number | undefined } {
  let from: number | undefined;
  let newest: number | undefined;
  for (const page of history.pages) {
    for (const message of page.messages ?? []) {
      if (message.seq === undefined) continue;
      if (from === undefined || message.seq < from) from = message.seq;
      if (newest === undefined || message.seq > newest) newest = message.seq;
    }
  }
  return { from, upTo: isDetached(history) ? newest : undefined };
}

/**
 * The Message to open a Conversation at, from the address (`?at=120`, a search result's Sequence number), or nothing
 * for the latest: only a positive whole number that is a safe integer counts, anything else opens at the latest.
 */
export function targetFrom(value: string | null): number | undefined {
  if (value === null || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const seq = Number(value);
  return Number.isSafeInteger(seq) ? seq : undefined;
}

/**
 * Whether what is read on screen may be reported. A read position means everything before it was read, so it is only
 * reported when nothing unread is missing between it and what is shown: never from a detached window, and from a window
 * that reaches the latest only when it also reaches back to the first unread Message (taken when the view opened). A
 * Conversation opened at the latest reports as always.
 */
export function readingReportable({
  detached,
  target,
  firstUnread,
  oldestLoaded,
}: {
  detached: boolean;
  target: number | undefined;
  firstUnread: number | undefined;
  oldestLoaded: number | undefined;
}): boolean {
  if (detached) return false;
  if (target === undefined || firstUnread === undefined) return true;
  return oldestLoaded !== undefined && oldestLoaded <= firstUnread;
}
