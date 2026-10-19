import type { MessagePage, MessageResponse } from "@/lib/api";

/** What `useInfiniteQuery` keeps for a Conversation's history: newest page first. */
export type History = { pages: MessagePage[]; pageParams: unknown[] };

/** The highest `seq` loaded, or 0 when no Message is. */
export function latestSeq(history: History): number {
  let latest = 0;
  for (const page of history.pages) for (const message of page.messages ?? []) latest = Math.max(latest, message.seq ?? 0);
  return latest;
}

/** The history with the Message in its newest page (a Message already there is replaced, never doubled). */
export function withMessage(history: History, message: MessageResponse): History {
  if (history.pages.length === 0) return history;
  const [newest, ...older] = history.pages;
  const messages = [...(newest.messages ?? []).filter((known) => known.seq !== message.seq), message];
  return { ...history, pages: [{ ...newest, messages }, ...older] };
}
