import type { MessagePage, MessageResponse } from "@/lib/api";
import { mergeVersion } from "./versions";

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

/** The lowest `seq` loaded, or nothing when no Message is. */
export function oldestSeq(history: History): number | undefined {
  let oldest: number | undefined;
  for (const page of history.pages) {
    for (const message of page.messages ?? []) {
      if (message.seq !== undefined && (oldest === undefined || message.seq < oldest)) oldest = message.seq;
    }
  }
  return oldest;
}

/** The history with the Message swapped in the page that holds it, or added to the newest page when it is not loaded. */
export function replaceMessage(history: History, message: MessageResponse): History {
  const holder = history.pages.findIndex((page) => page.messages?.some((known) => known.seq === message.seq));
  if (holder < 0) return withMessage(history, message);
  return {
    ...history,
    pages: history.pages.map((page, index) =>
      index === holder ? { ...page, messages: page.messages?.map((known) => (known.seq === message.seq ? message : known)) } : page,
    ),
  };
}

/** The history without the Message with this `seq` (the same object when it was not there). */
export function removeMessage(history: History, seq: number): History {
  if (!history.pages.some((page) => page.messages?.some((known) => known.seq === seq))) return history;
  return {
    ...history,
    pages: history.pages.map((page) => ({ ...page, messages: page.messages?.filter((known) => known.seq !== seq) })),
  };
}

/**
 * Makes the loaded Messages from `from` up to `upTo` match `fresh`, what the server says now for that range, in one
 * pass: its Messages replace or join the loaded ones, and loaded Messages in the range that it no longer shows (hidden
 * by this person in another tab) go. A loaded Message past `upTo` is left alone (it may have arrived live while the
 * range was being fetched), and a loaded version that is newer than the fetched one stays (an edit or deletion heard
 * live meanwhile must not be undone by an older answer). Only call it with a range that was fetched completely.
 */
export function syncRange(history: History, fresh: readonly MessageResponse[], from: number, upTo: number): History {
  const freshBySeq = new Map(fresh.map((message) => [message.seq, message] as const));
  const loaded = new Set<number | undefined>();
  const pages = history.pages.map((page) => ({
    ...page,
    messages: (page.messages ?? []).flatMap((message) => {
      loaded.add(message.seq);
      const seq = message.seq;
      if (seq === undefined || seq < from || seq > upTo) return [message];
      const now = freshBySeq.get(seq);
      return now ? [mergeVersion(message, now)] : [];
    }),
  }));
  const joining = fresh.filter((message) => !loaded.has(message.seq));
  if (pages.length > 0 && joining.length > 0) pages[0] = { ...pages[0], messages: [...pages[0].messages, ...joining] };
  return { ...history, pages };
}

/** The Message with this id as a placeholder (no text, deleted at `at`); the same history when it is absent or already one. */
export function markDeleted(history: History, messageId: string, at: string): History {
  const known = history.pages.flatMap((page) => page.messages ?? []).find((message) => message.id === messageId);
  if (!known || known.deletedAt) return history;
  return replaceMessage(history, { ...known, body: undefined, deletedAt: at });
}

/** The history without the Message with this id (the same object when it was not there). */
export function removeById(history: History, messageId: string): History {
  const known = history.pages.flatMap((page) => page.messages ?? []).find((message) => message.id === messageId);
  return known?.seq === undefined ? history : removeMessage(history, known.seq);
}
