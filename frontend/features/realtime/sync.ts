import type { QueryClient } from "@tanstack/react-query";
import {
  blocksQueryKey,
  listQueryKey,
  meQueryKey,
  presenceQueryKey,
  type BlockedUser,
  type ConversationResponse,
  type ConversationSettings,
  type PresenceView,
  type UserProfile,
} from "@/lib/api";
import { parseEvent, type ProfileChanges, type RealtimeEvent } from "@/lib/realtime/events";
import { directWith } from "@/features/conversations/present";
import { withoutBlockedUser } from "@/features/session/blocked-users";
import { catchUpHistory, refreshHistory } from "@/features/messages/catch-up";
import type { History } from "@/features/messages/history";
import { allMessagesKey, historyConversationId, messagesKey, reactionTimesKey } from "@/features/messages/queries";
import { isDetached } from "@/features/messages/window";
import { acceptReaction } from "@/features/messages/reactions";
import { readPositionKey, receiptsKey } from "@/features/receipts/queries";
import { mergeFrontier, type Frontier } from "@/features/receipts/status";
import { applyPresence } from "@/features/presence/apply-presence";
import type { TypingTracker } from "@/features/presence/typing-tracker";
import { allPresenceKey } from "@/features/presence/use-presence";
import { applyProfileChanges, applyToHistory, applyToList, applyUnread } from "./apply-event";

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

/** Puts an event into the Conversation list that is loaded, or asks for the list again (see `fetching`). */
function patchList(queryClient: QueryClient, event: RealtimeEvent) {
  if (fetching(queryClient, listQueryKey())) {
    void queryClient.invalidateQueries({ queryKey: listQueryKey() });
    return;
  }
  const list = queryClient.getQueryData<ConversationResponse[]>(listQueryKey());
  if (!list) return;
  const myId = queryClient.getQueryData<UserProfile>(meQueryKey())?.id;
  const next = applyToList(list, event, myId);
  if (next.list !== list) queryClient.setQueryData(listQueryKey(), next.list);
  if (next.refetch) void queryClient.invalidateQueries({ queryKey: listQueryKey() });
}

/**
 * The person's own mute, archive or pin as the server just answered it to their own change: put into the list the same
 * way as the event for it, which also arrives (and finds it done).
 */
export function recordSettings(queryClient: QueryClient, conversationId: string, settings: ConversationSettings) {
  patchList(queryClient, { type: "settings.changed", conversationId, settings });
}

/**
 * Someone's new name or Avatar, from the event or from the answer to the person's own change: put into the
 * Conversation list (where every Participant's name and picture are read from) and, when it is the signed-in person's
 * own, into their profile. Only the keys in `changes` are touched; `avatarUrl: null` takes the picture away.
 */
export function recordProfile(queryClient: QueryClient, userId: string, changes: ProfileChanges) {
  const me = queryClient.getQueryData<UserProfile>(meQueryKey());
  if (me?.id === userId) {
    const next = applyProfileChanges(me, changes);
    if (next !== me) queryClient.setQueryData<UserProfile>(meQueryKey(), next);
  }
  patchList(queryClient, { type: "profile.changed", userId, changes });
}

/**
 * A Block or Unblock made by this person, from the event or from the answer to their own change: the Direct
 * conversation is marked in the list, and what the server now shows differently is asked for again: that
 * Conversation's Messages (the other person's reactions are hidden while the Block lasts and shown again after it),
 * its presence (gone while it lasts) and the list of Blocked Users.
 */
export function recordBlock(queryClient: QueryClient, userId: string, blocked: boolean) {
  patchList(queryClient, { type: "block.changed", userId, blocked });
  const myId = queryClient.getQueryData<UserProfile>(meQueryKey())?.id;
  const direct = directWith(queryClient.getQueryData<ConversationResponse[]>(listQueryKey()) ?? [], userId, myId);
  if (direct?.id) {
    void queryClient.invalidateQueries({ queryKey: messagesKey(direct.id) });
    void queryClient.invalidateQueries({ queryKey: presenceQueryKey({ path: { conversationId: direct.id } }) });
  }
  // An Unblock leaves the Blocked Users list at once; a Block needs the person's name and picture, so the list is asked for.
  if (!blocked && !fetching(queryClient, blocksQueryKey())) {
    queryClient.setQueryData<BlockedUser[]>(blocksQueryKey(), (list) => withoutBlockedUser(list, userId));
  }
  void queryClient.invalidateQueries({ queryKey: blocksQueryKey() });
}

/**
 * A reaction put on a Message, or everyone's reactions of one person taken away. Reactions are only in the loaded
 * history, never the list. A word older than one already heard for the same person and Message is ignored, and, as
 * for other events, a history whose request is under way is asked for again instead of being patched.
 */
function handleReaction(queryClient: QueryClient, event: Extract<RealtimeEvent, { type: "reaction.changed" | "reactions.cleared" }>) {
  if (event.type === "reaction.changed") {
    const known = queryClient.getQueryData<Record<string, string>>(reactionTimesKey(event.conversationId)) ?? {};
    const verdict = acceptReaction(known, event);
    if (!verdict.accepted) return;
    queryClient.setQueryData(reactionTimesKey(event.conversationId), verdict.times);
  }
  const key = messagesKey(event.conversationId);
  if (fetching(queryClient, key)) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const history = queryClient.getQueryData<History>(key);
  const next = applyToHistory(history, event);
  if (next.history !== history) queryClient.setQueryData(key, next.history);
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
  if (event.type === "profile.changed") {
    recordProfile(queryClient, event.userId, event.changes);
    return;
  }
  if (event.type === "block.changed") {
    recordBlock(queryClient, event.userId, event.blocked);
    return;
  }
  if (event.type === "reaction.changed" || event.type === "reactions.cleared") {
    handleReaction(queryClient, event);
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

  patchList(queryClient, event);

  if (event.type === "receipts.updated") {
    queryClient.setQueryData<Frontier>(receiptsKey(event.conversationId), (known) => mergeFrontier(known, event));
    return;
  }
  if (event.type !== "message.created" && event.type !== "message.updated") return;
  const key = messagesKey(event.conversationId);
  // A detached window takes no new Message (`applyToHistory`), so one arriving while a page of it is fetched need not
  // restart that request: in a busy Group it would never finish. The view catches up once the window attaches.
  const loaded = queryClient.getQueryData<History>(key);
  if (event.type === "message.created" && loaded && isDetached(loaded)) return;
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
  void queryClient.invalidateQueries({ queryKey: blocksQueryKey() }); // a block.changed may have been missed
  queryClient
    .getQueryCache()
    .findAll({ queryKey: allMessagesKey })
    .forEach((query) => {
      const conversationId = historyConversationId(query.queryKey);
      if (conversationId) void refreshHistory(queryClient, conversationId);
    });
}
