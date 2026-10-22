"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { searchAllInfiniteOptions, searchConversationInfiniteOptions, type SearchPage } from "@/lib/api";
import { nextBefore } from "./results";

/** Where to search: one Conversation, or every Conversation the person is in. */
export type SearchScope = { kind: "conversation"; conversationId: string } | { kind: "all" };

/**
 * Search for `q` (checked already; nothing is asked while it is undefined), 20 results a page, newest first, more on
 * demand (`fetchNextPage`, the last result's id as `before`). Results are never fetched again behind the person's back
 * (window focus, reconnect, going stale): every request counts against the 30 searches a minute shared by both kinds,
 * so only typing, 'More results' and Try again ask.
 */
export function useMessageSearch(scope: SearchScope, q: string | undefined) {
  const query = { q: q ?? "" };
  const options =
    scope.kind === "all"
      ? { ...searchAllInfiniteOptions({ query }), initialPageParam: { query } }
      : { ...searchConversationInfiniteOptions({ path: { conversationId: scope.conversationId }, query }), initialPageParam: { path: { conversationId: scope.conversationId }, query } };
  return useInfiniteQuery({
    // The two generated options differ only in their key and request (the one-Conversation kind has a `path`); they
    // return the same `SearchPage`, so one type stands for both here. Each keeps its own key, so changing the scope
    // never mixes their results.
    ...(options as ReturnType<typeof searchAllInfiniteOptions> & { initialPageParam: { query: { q: string } } }),
    getNextPageParam: (page: SearchPage) => nextBefore(page),
    enabled: q !== undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
