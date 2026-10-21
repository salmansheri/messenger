import type { AttachmentResponse, MessagePage, MessageResponse, ReactionView } from "@/lib/api";
import { linkLapsed } from "@/lib/signed-link";
import { clearUser } from "./reactions";
import { mergeVersion } from "./versions";
import { isDetached } from "./window";

/** What `useInfiniteQuery` keeps for a Conversation's history: newest page first. */
export type History = { pages: MessagePage[]; pageParams: unknown[] };

/** The highest `seq` loaded, or 0 when no Message is. */
export function latestSeq(history: History): number {
  let latest = 0;
  for (const page of history.pages) for (const message of page.messages ?? []) latest = Math.max(latest, message.seq ?? 0);
  return latest;
}

/**
 * The history with the Message in its newest page (a Message already there is replaced, never doubled). A detached
 * history is left as it is: its newest page is not the latest, so the Message would sit after a gap.
 */
export function withMessage(history: History, message: MessageResponse): History {
  if (history.pages.length === 0 || isDetached(history)) return history;
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

/** Whether the signed links of an image have run out (or are about to); see `linkLapsed`. */
export function linksLapsed(attachment: AttachmentResponse, now: number): boolean {
  return linkLapsed(attachment.thumbnailUrl, now);
}

/**
 * Makes the loaded Messages from `from` up to `upTo` match `fresh`, what the server says now for that range, in one
 * pass: its Messages replace or join the loaded ones, and loaded Messages in the range that it no longer shows (hidden
 * by this person in another tab) go. A loaded Message past `upTo` is left alone (it may have arrived live while the
 * range was being fetched), and a loaded version that is newer than the fetched one stays (an edit or deletion heard
 * live meanwhile must not be undone by an older answer). Only call it with a range that was fetched completely.
 */
export function syncRange(
  history: History,
  fresh: readonly MessageResponse[],
  from: number,
  upTo: number,
  { replaceLinks = false, now: nowMs = Date.now() }: { replaceLinks?: boolean; now?: number } = {},
): History {
  const freshBySeq = new Map(fresh.map((message) => [message.seq, message] as const));
  const loaded = new Set<number | undefined>();
  const pages = history.pages.map((page) => ({
    ...page,
    messages: (page.messages ?? []).flatMap((message) => {
      loaded.add(message.seq);
      const seq = message.seq;
      if (seq === undefined || seq < from || seq > upTo) return [message];
      const now = freshBySeq.get(seq);
      if (!now) return [];
      const merged = mergeVersion(message, now);
      // Reactions change without a new version of the Message, so the server's are taken whatever the version says.
      if (merged.deletedAt) return [merged];
      const refreshed = now.reactions ? { ...merged, reactions: now.reactions } : merged;
      // An image's links are signed afresh on every answer; the ones held are kept (the browser has the picture under
      // that address) unless they have run out, or the caller found them dead and wants new ones whatever they say.
      const swap = now.attachment && (replaceLinks || !refreshed.attachment || linksLapsed(refreshed.attachment, nowMs));
      return [swap ? { ...refreshed, attachment: now.attachment } : refreshed];
    }),
  }));
  const joining = fresh.filter((message) => !loaded.has(message.seq));
  if (pages.length > 0 && joining.length > 0) pages[0] = { ...pages[0], messages: [...pages[0].messages, ...joining] };
  return { ...history, pages };
}

/** The Message with this id as a placeholder (no text or image, deleted at `at`); the same history when it is absent or already one. */
export function markDeleted(history: History, messageId: string, at: string): History {
  const known = history.pages.flatMap((page) => page.messages ?? []).find((message) => message.id === messageId);
  if (!known || known.deletedAt) return history;
  return replaceMessage(history, { ...known, body: undefined, deletedAt: at, attachment: undefined });
}

/** The history without the Message with this id (the same object when it was not there). */
export function removeById(history: History, messageId: string): History {
  const known = history.pages.flatMap((page) => page.messages ?? []).find((message) => message.id === messageId);
  return known?.seq === undefined ? history : removeMessage(history, known.seq);
}

/**
 * The history with the reactions of the Message with this id changed by `change` (given the reactions it has, or
 * nothing). The same history when the Message is not loaded, is deleted (it has no reactions), or they do not change.
 */
export function updateReactions(
  history: History,
  messageId: string,
  change: (reactions: ReactionView[] | undefined) => ReactionView[] | undefined,
): History {
  const known = history.pages.flatMap((page) => page.messages ?? []).find((message) => message.id === messageId);
  if (!known || known.deletedAt) return history;
  const next = change(known.reactions);
  const unchanged = next === known.reactions || ((next?.length ?? 0) === 0 && (known.reactions?.length ?? 0) === 0);
  return unchanged ? history : replaceMessage(history, { ...known, reactions: next });
}

/** The history with one person taken out of the reactions of every loaded Message (the same one if they were in none). */
export function clearReactionsOf(history: History, userId: string): History {
  let changed = false;
  const pages = history.pages.map((page) => ({
    ...page,
    messages: page.messages?.map((message) => {
      const reactions = clearUser(message.reactions, userId);
      if (reactions === message.reactions || (message.reactions === undefined && reactions.length === 0)) return message;
      changed = true;
      return { ...message, reactions };
    }),
  }));
  return changed ? { ...history, pages } : history;
}
