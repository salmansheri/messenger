import type { QueryClient } from "@tanstack/react-query";
import { sdk, type MessageResponse } from "@/lib/api";
import { latestSeq, syncRange, type History } from "./history";
import { addMessageToHistory, messagesKey } from "./queries";
import { isDetached, refreshBounds } from "./window";

/**
 * Fetches the Messages a loaded history is missing: everything after the newest one it has (`afterSeq`), however many
 * pages that takes. Nothing happens for a Conversation whose history is not loaded, or is a detached window (its newer
 * Messages come when the person pages forward or jumps to the latest), and a failure is left for the next catch-up:
 * the Messages are on the server either way.
 */
export async function catchUpHistory(queryClient: QueryClient, conversationId: string) {
  const history = queryClient.getQueryData<History>(messagesKey(conversationId));
  if (!history || isDetached(history)) return;
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
 * the whole range was fetched; a failure is left for the next reconnection. A detached window is fetched only up to
 * its own newest Message (`refreshBounds`), so it stays a window. `replaceLinks` takes the server's image links even
 * where the ones held look valid (an image failed to load, so they cannot be trusted).
 */
export async function refreshHistory(queryClient: QueryClient, conversationId: string, { replaceLinks = false } = {}) {
  const history = queryClient.getQueryData<History>(messagesKey(conversationId));
  if (!history) return;
  const { from, upTo } = refreshBounds(history);
  if (from === undefined) return catchUpHistory(queryClient, conversationId);
  const fresh: MessageResponse[] = [];
  // Everything loaded now is within the range being fetched; anything that arrives live meanwhile is past it.
  const loadedUpTo = latestSeq(history);
  let after = from - 1;
  try {
    for (;;) {
      const { data: page } = await sdk.history_({ path: { conversationId }, query: { afterSeq: after, limit: 100 } });
      const messages = page.messages ?? [];
      fresh.push(...messages.filter((message) => upTo === undefined || (message.seq ?? 0) <= upTo));
      const newest = messages.at(-1)?.seq;
      if (!page.hasMore || newest === undefined || newest <= after || (upTo !== undefined && newest >= upTo)) break;
      after = newest;
    }
  } catch {
    return;
  }
  const through = upTo ?? Math.max(loadedUpTo, fresh.at(-1)?.seq ?? 0);
  // The history may have been started again meanwhile (the person jumped from a window to the latest): its first
  // request is then a new one, and this range no longer belongs to it. Paging and refetching keep that request.
  const started = history.pageParams[0];
  queryClient.setQueryData<History>(messagesKey(conversationId), (current) =>
    current && current.pageParams.includes(started) ? syncRange(current, fresh, from, through, { replaceLinks }) : current,
  );
}
