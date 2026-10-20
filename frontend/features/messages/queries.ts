"use client";

import { useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import { historyInfiniteOptions, historyInfiniteQueryKey, type MessagePage, type MessageResponse } from "@/lib/api";
import { markDeleted, removeById, withMessage, type History } from "./history";
import { mergeVersion } from "./versions";

const OLDER_PAGE = 50;

/** A Conversation's history as the query cache knows it (the key the generated paging options use). */
export const messagesKey = (conversationId: string) => historyInfiniteQueryKey({ path: { conversationId } });

/** The start of every Conversation's history key, for finding all the histories that are loaded. */
export const allMessagesKey = [{ _id: "history", _infinite: true }];

/** Which Conversation a history key belongs to. */
export function historyConversationId(key: readonly unknown[]): string | undefined {
  const params = key[0] as { path?: { conversationId?: string } } | undefined;
  return params?.path?.conversationId;
}

/**
 * A Conversation's history, newest page first and older ones on demand (`beforeSeq`). `firstPage` is how many of the
 * newest to ask for: more than usual when many are unread, so the first unread Message is already on screen.
 */
export function useMessageHistory(conversationId: string, firstPage: number) {
  return useInfiniteQuery({
    ...historyInfiniteOptions({ path: { conversationId } }),
    initialPageParam: { path: { conversationId }, query: { limit: firstPage } },
    getNextPageParam: (page: MessagePage) => {
      const oldest = page.hasMore ? page.messages?.[0]?.seq : undefined;
      return oldest === undefined ? undefined : { path: { conversationId }, query: { beforeSeq: oldest, limit: OLDER_PAGE } };
    },
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

/** An edited Message the server just confirmed, put into the loaded history (never replacing a newer version). */
export function updateMessageInHistory(queryClient: QueryClient, message: MessageResponse) {
  if (!message.conversationId) return;
  queryClient.setQueryData<History>(messagesKey(message.conversationId), (history) => {
    if (!history) return history;
    const known = history.pages.flatMap((page) => page.messages ?? []).find((candidate) => candidate.seq === message.seq);
    return known ? replaceIfChanged(history, known, mergeVersion(known, message)) : withMessage(history, message);
  });
}

function replaceIfChanged(history: History, known: MessageResponse, merged: MessageResponse): History {
  return merged === known
    ? history
    : { ...history, pages: history.pages.map((page) => ({ ...page, messages: page.messages?.map((m) => (m === known ? merged : m)) })) };
}

/** A Message this person just deleted for everyone, shown as the placeholder at once (the event brings the server's time). */
export function markDeletedInHistory(queryClient: QueryClient, conversationId: string, messageId: string) {
  queryClient.setQueryData<History>(messagesKey(conversationId), (history) =>
    history && markDeleted(history, messageId, new Date().toISOString()),
  );
}

/** A Message this person just hid from their own view. */
export function removeFromHistory(queryClient: QueryClient, conversationId: string, messageId: string) {
  queryClient.setQueryData<History>(messagesKey(conversationId), (history) => history && removeById(history, messageId));
}
