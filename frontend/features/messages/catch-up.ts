import type { QueryClient } from "@tanstack/react-query";
import { sdk } from "@/lib/api";
import { latestSeq, type History } from "./history";
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
