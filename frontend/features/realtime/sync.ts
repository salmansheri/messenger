import type { QueryClient } from "@tanstack/react-query";
import { listQueryKey, meQueryKey, presenceQueryKey, type ConversationResponse, type PresenceView, type UserProfile } from "@/lib/api";
import { parseEvent } from "@/lib/realtime/events";
import { catchUpHistory, refreshHistory } from "@/features/messages/catch-up";
import type { History } from "@/features/messages/history";
import { allMessagesKey, historyConversationId, messagesKey } from "@/features/messages/queries";
import { readPositionKey, receiptsKey } from "@/features/receipts/queries";
import { mergeFrontier, type Frontier } from "@/features/receipts/status";
import { applyPresence } from "@/features/presence/apply-presence";
import type { TypingTracker } from "@/features/presence/typing-tracker";
import { allPresenceKey } from "@/features/presence/use-presence";
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
  const list = queryClient.getQueryData<ConversationResponse[]>(listQueryKey());
  const result = applyUnread(list ?? [], queryClient.getQueryData<number>(key), report);
  queryClient.setQueryData<number>(key, result.readSeq);
  if (fetching(queryClient, listQueryKey())) {
    void queryClient.invalidateQueries({ queryKey: listQueryKey() });
  } else if (list && result.list !== list) {
    queryClient.setQueryData(listQueryKey(), result.list);
  }
}

/** Puts one event into what is already loaded; anything that cannot be worked out from it asks the server again. */
export function handleEvent(queryClient: QueryClient, body: string, typing: TypingTracker) {
  const event = parseEvent(body);
  if (!event) return;

  if (event.type === "typing.changed") {
    if (event.typing) typing.started(event.conversationId, event.userId);
    else typing.stopped(event.conversationId, event.userId);
    return;
  }
  if (event.type === "presence.changed") {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: allPresenceKey })) {
      if (query.state.fetchStatus === "fetching") void queryClient.invalidateQueries({ queryKey: query.queryKey });
      else queryClient.setQueryData<PresenceView[]>(query.queryKey, (views) => applyPresence(views, event));
    }
    return;
  }
  if (event.type === "message.created" && event.message.senderId) typing.stopped(event.conversationId, event.message.senderId); // sending ends typing
  // Someone may have joined or left, and the new Participant's presence is not in what is loaded.
  if (event.type === "conversation.changed") {
    void queryClient.invalidateQueries({ queryKey: presenceQueryKey({ path: { conversationId: event.conversationId } }) });
  }

  if (event.type === "unread.updated") {
    recordUnread(queryClient, event);
    return;
  }

  if (fetching(queryClient, listQueryKey())) {
    void queryClient.invalidateQueries({ queryKey: listQueryKey() });
  } else {
    const list = queryClient.getQueryData<ConversationResponse[]>(listQueryKey());
    if (list) {
      const myId = queryClient.getQueryData<UserProfile>(meQueryKey())?.id;
      const next = applyToList(list, event, myId);
      if (next.list !== list) queryClient.setQueryData(listQueryKey(), next.list);
      if (next.refetch) void queryClient.invalidateQueries({ queryKey: listQueryKey() });
    }
  }

  if (event.type === "receipts.updated") {
    queryClient.setQueryData<Frontier>(receiptsKey(event.conversationId), (known) => mergeFrontier(known, event));
    return;
  }
  if (event.type !== "message.created" && event.type !== "message.updated") return;
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
 * (even a request already under way may have been answered before the subscription started) and bring every loaded
 * history up to date. Fetching only what is newer is not enough: an edit or a deletion keeps its Sequence number, so
 * the loaded range is fetched again and compared.
 */
export function catchUp(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: listQueryKey() });
  void queryClient.invalidateQueries({ queryKey: allPresenceKey });
  queryClient
    .getQueryCache()
    .findAll({ queryKey: allMessagesKey })
    .forEach((query) => {
      const conversationId = historyConversationId(query.queryKey);
      if (conversationId) void refreshHistory(queryClient, conversationId);
    });
}
