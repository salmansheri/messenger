"use client";

import { useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import { historyInfiniteOptions, historyInfiniteQueryKey, type MessagePage, type MessageResponse } from "@/lib/api";
import { markDeleted, removeById, updateReactions, withMessage, type History } from "./history";
import { mergeVersion } from "./versions";
import { firstParam, newerParam, olderParam } from "./window";

/** A Conversation's history as the query cache knows it (the key the generated paging options use). */
export const messagesKey = (conversationId: string) => historyInfiniteQueryKey({ path: { conversationId } });

/**
 * When the server last said what each person reacted with to each Message (by "messageId:userId"), so a late or repeated
 * event never undoes a newer one. Hand-keyed: it is not API data.
 */
export const reactionTimesKey = (conversationId: string) => ["reaction-times", conversationId] as const;

/** The start of every Conversation's history key, for finding all the histories that are loaded. */
export const allMessagesKey = [{ _id: "history", _infinite: true }];

/** Which Conversation a history key belongs to. */
export function historyConversationId(key: readonly unknown[]): string | undefined {
  const params = key[0] as { path?: { conversationId?: string } } | undefined;
  return params?.path?.conversationId;
}

/**
 * A Conversation's history, newest page first. It starts from the newest Messages, or, with `target`, from the window
 * around that Message (a search result): older pages come on demand (`fetchNextPage`, `beforeSeq`) and, while the
 * window is detached from the latest, newer ones too (`fetchPreviousPage`, `afterSeq`; see `window.ts`). `firstPage` is
 * how many of the newest to ask for: more than usual when many are unread, so the first unread Message is on screen.
 */
export function useMessageHistory(conversationId: string, firstPage: number, target?: number) {
  return useInfiniteQuery({
    ...historyInfiniteOptions({ path: { conversationId } }),
    initialPageParam: firstParam(conversationId, target, firstPage),
    getNextPageParam: (page: MessagePage, _pages: MessagePage[], param: unknown) => olderParam(page, param),
    getPreviousPageParam: (page: MessagePage, _pages: MessagePage[], param: unknown) => newerParam(page, param),
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

/** The reactions the server just answered for a Message after the person's own change, put into the loaded history. */
export function setReactionsInHistory(queryClient: QueryClient, message: MessageResponse) {
  if (!message.conversationId || !message.id) return;
  const reactions = message.reactions ?? [];
  queryClient.setQueryData<History>(messagesKey(message.conversationId), (history) =>
    history && updateReactions(history, message.id ?? "", () => reactions),
  );
}
