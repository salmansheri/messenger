"use client";

import { useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import { call, sdk, type MessagePage, type MessageResponse } from "@/lib/api";
import { withMessage, type History } from "./history";

export const messagesKey = (conversationId: string) => ["messages", conversationId] as const;

const OLDER_PAGE = 50;

/**
 * A Conversation's history, newest page first and older ones on demand (`beforeSeq`). `firstPage` is how many of the
 * newest to ask for: more than usual when many are unread, so the first unread Message is already on screen.
 */
export function useMessageHistory(conversationId: string, firstPage: number) {
  return useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      call(
        sdk.history_({
          path: { conversationId },
          query: pageParam === undefined ? { limit: firstPage } : { beforeSeq: pageParam, limit: OLDER_PAGE },
        }),
      ),
    getNextPageParam: (page: MessagePage) => (page.hasMore ? page.messages?.[0]?.seq : undefined),
    // Leaving a Conversation drops its history, so opening it again always starts from what the server has now
    // (positioning on stale pages would leave the view at an old bottom with the new Messages below it).
    gcTime: 0,
  });
}

/** Adds a stored Message to the newest page of an already loaded history (a Message already there is replaced). */
export function addMessageToHistory(queryClient: QueryClient, message: MessageResponse) {
  if (!message.conversationId) return;
  queryClient.setQueryData<History>(messagesKey(message.conversationId), (history) => history && withMessage(history, message));
}
