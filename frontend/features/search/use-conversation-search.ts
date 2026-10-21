"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { searchConversationInfiniteOptions, type SearchPage } from "@/lib/api";
import { nextBefore } from "./results";

/**
 * Search in one Conversation for `q` (checked already; nothing is asked while it is undefined), 20 results a page,
 * newest first, more on demand (`fetchNextPage`, the last result's id as `before`). Results are never fetched again
 * behind the person's back (window focus, reconnect, going stale): every request counts against the 30 searches a
 * minute, so only typing, 'More results' and Try again ask.
 */
export function useConversationSearch(conversationId: string, q: string | undefined) {
  return useInfiniteQuery({
    ...searchConversationInfiniteOptions({ path: { conversationId }, query: { q: q ?? "" } }),
    initialPageParam: { path: { conversationId }, query: { q: q ?? "" } },
    getNextPageParam: (page: SearchPage) => nextBefore(page),
    enabled: q !== undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
