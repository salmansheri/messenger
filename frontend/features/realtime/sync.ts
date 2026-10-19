import type { QueryClient } from "@tanstack/react-query";
import type { ConversationResponse, UserProfile } from "@/lib/api";
import { parseEvent } from "@/lib/realtime/events";
import { conversationsKey } from "@/features/conversations/queries";
import { catchUpHistory } from "@/features/messages/catch-up";
import type { History } from "@/features/messages/history";
import { allMessagesKey, messagesKey } from "@/features/messages/queries";
import { meKey } from "@/features/session/use-me";
import { readPositionKey, receiptsKey } from "@/features/receipts/queries";
import { mergeFrontier, type Frontier } from "@/features/receipts/status";
import { applyToHistory, applyToList, applyUnread } from "./apply-event";

/**
 * Whether a request for this data is under way. Its answer may have been worked out before the event happened, so
 * patching the cache now would be undone when the answer lands: ask again instead (which restarts the request).
 */
const fetching = (queryClient: QueryClient, key: readonly unknown[]) => queryClient.isFetching({ queryKey: key }) > 0;

/**
 * This person's unread count after a report, from an event or from the answer to their own report. A report older than
 * one already applied is ignored; the list is patched unless a request for it is under way (then it is asked for again).
 */
export function recordUnread(queryClient: QueryClient, report: { conversationId: string; readSeq: number; unreadCount: number }) {
  const key = readPositionKey(report.conversationId);
  const list = queryClient.getQueryData<ConversationResponse[]>(conversationsKey);
  const result = applyUnread(list ?? [], queryClient.getQueryData<number>(key), report);
  queryClient.setQueryData<number>(key, result.readSeq);
  if (fetching(queryClient, conversationsKey)) {
    void queryClient.invalidateQueries({ queryKey: conversationsKey });
  } else if (list && result.list !== list) {
    queryClient.setQueryData(conversationsKey, result.list);
  }
}

/** Puts one event into what is already loaded; anything that cannot be worked out from it asks the server again. */
export function handleEvent(queryClient: QueryClient, body: string) {
  const event = parseEvent(body);
  if (!event) return;

  if (event.type === "unread.updated") {
    recordUnread(queryClient, event);
    return;
  }

  if (fetching(queryClient, conversationsKey)) {
    void queryClient.invalidateQueries({ queryKey: conversationsKey });
  } else {
    const list = queryClient.getQueryData<ConversationResponse[]>(conversationsKey);
    if (list) {
      const myId = queryClient.getQueryData<UserProfile>(meKey)?.id;
      const next = applyToList(list, event, myId);
      if (next.list !== list) queryClient.setQueryData(conversationsKey, next.list);
      if (next.refetch) void queryClient.invalidateQueries({ queryKey: conversationsKey });
    }
  }

  if (event.type === "receipts.updated") {
    queryClient.setQueryData<Frontier>(receiptsKey(event.conversationId), (known) => mergeFrontier(known, event));
    return;
  }
  if (event.type !== "message.created") return;
  const key = messagesKey(event.conversationId);
  if (fetching(queryClient, key)) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const history = queryClient.getQueryData<History>(key);
  const next = applyToHistory(history, event);
  if (next.history !== history) queryClient.setQueryData(key, next.history);
  if (next.catchUp) void catchUpHistory(queryClient, event.conversationId);
}

/**
 * After a connection is (re)established, whatever was loaded before may have missed events: ask for the list again
 * (even a request already under way may have been answered before the subscription started) and fetch what every
 * loaded history is missing.
 */
export function catchUp(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: conversationsKey });
  queryClient
    .getQueryCache()
    .findAll({ queryKey: allMessagesKey })
    .forEach((query) => {
      const conversationId = query.queryKey[1];
      if (typeof conversationId === "string") void catchUpHistory(queryClient, conversationId);
    });
}
