import type { MessageResponse } from "@/lib/api";

/** The most characters of a Message that are read out. */
export const LONGEST_SPOKEN = 200;

/** More than this many new Messages at once are announced as a count, not one by one. */
const READ_OUT_UP_TO = 3;

/** The Messages from other people newer than the last one announced, oldest first (your own are never announced). */
export function unannounced(
  messages: readonly MessageResponse[],
  announcedUpTo: number,
  myId: string | undefined,
): MessageResponse[] {
  if (!myId) return [];
  return messages.filter((message) => (message.seq ?? 0) > announcedUpTo && message.senderId !== myId);
}

/** What a screen reader says for a new Message: who, then what, on one line and not longer than is bearable. */
export function announcementOf(message: MessageResponse, sender: string): string {
  const text = (message.body ?? "").replace(/\s+/g, " ").trim();
  const spoken = text.length > LONGEST_SPOKEN ? `${text.slice(0, LONGEST_SPOKEN)}…` : text;
  return `${sender}: ${spoken}`;
}

/**
 * What to say for Messages that have just arrived: each one with who wrote it when there are a few, only how many when
 * there are more than that (a catch-up after a reconnect should not read out a page of text).
 */
export function announcementsFor(
  fresh: readonly MessageResponse[],
  nameOf: (senderId: string | undefined) => string,
): { seq: number; text: string }[] {
  if (fresh.length === 0) return [];
  if (fresh.length > READ_OUT_UP_TO) return [{ seq: fresh.at(-1)?.seq ?? 0, text: `${fresh.length} new Messages` }];
  return fresh.map((message) => ({ seq: message.seq ?? 0, text: announcementOf(message, nameOf(message.senderId)) }));
}
