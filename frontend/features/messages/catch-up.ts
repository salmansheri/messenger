import type { QueryClient } from "@tanstack/react-query";
import { sdk, type MessageResponse } from "@/lib/api";
import { latestSeq, oldestSeq, syncRange, type History } from "./history";
import { addMessageToHistory, messagesKey } from "./queries";

/**
 * Fetches the Messages a loaded history is missing: everything after the newest one it has (`afterSeq`), however many
 * pages that takes. Nothing happens for a Conversation whose history is not loaded, and a failure is left for the
 * next catch-up: the Messages are on the server either way.
 */
export async function catchUpHistory(queryClient: QueryClient, conversationId: string) {
  const history = queryClient.getQueryData<History>(messagesKey(conversationId));
  if (!history) return;
  let after = latestSeq(history);
  try {
    for (;;) {
      const { data: page } = await sdk.history_({ path: { conversationId }, query: { afterSeq: after, limit: 100 } });
      const messages = page.messages ?? [];
      messages.forEach((message) => addMessageToHistory(queryClient, message));
      const newest = messages.at(-1)?.seq;
      if (!page.hasMore || newest === undefined || newest <= after) return;
      after = newest;
    }
  } catch {
    // The next connection, or the next event that skips ahead, tries again.
  }
}

/**
 * Brings a loaded history up to date after a connection was lost: the whole loaded range is fetched again (`afterSeq`
 * from just before the oldest Message loaded, however many pages that takes) and compared, because an edit or a
 * deletion keeps its Sequence number and so cannot be found by asking only for newer Messages. Nothing is changed unless
 * the whole range was fetched; a failure is left for the next reconnection. `replaceLinks` takes the server's image
 * links even where the ones held look valid (an image failed to load, so they cannot be trusted).
 */
export async function refreshHistory(queryClient: QueryClient, conversationId: string, { replaceLinks = false } = {}) {
  const history = queryClient.getQueryData<History>(messagesKey(conversationId));
  if (!history) return;
  const from = oldestSeq(history);
  if (from === undefined) return catchUpHistory(queryClient, conversationId);
  const fresh: MessageResponse[] = [];
  // Everything loaded now is within the range being fetched; anything that arrives live meanwhile is past it.
  const loadedUpTo = latestSeq(history);
  let after = from - 1;
  try {
    for (;;) {
      const { data: page } = await sdk.history_({ path: { conversationId }, query: { afterSeq: after, limit: 100 } });
      const messages = page.messages ?? [];
      fresh.push(...messages);
      const newest = messages.at(-1)?.seq;
      if (!page.hasMore || newest === undefined || newest <= after) break;
      after = newest;
    }
  } catch {
    return;
  }
  queryClient.setQueryData<History>(messagesKey(conversationId), (current) => current && syncRange(current, fresh, from, Math.max(loadedUpTo, fresh.at(-1)?.seq ?? 0), { replaceLinks }));
}
