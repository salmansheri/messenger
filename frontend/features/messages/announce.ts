import type { MessageResponse } from "@/lib/api";

/** The most characters of a Message that are read out. */
export const LONGEST_SPOKEN = 200;

/** More than this many new Messages at once are announced as a count, not one by one. */
const READ_OUT_UP_TO = 3;

/**
 * The Messages from other people newer than the last one announced, oldest first (your own are never announced, and
 * neither is one that is already deleted when it turns up: there is nothing left to read).
 */
export function unannounced(
  messages: readonly MessageResponse[],
  announcedUpTo: number,
  myId: string | undefined,
): MessageResponse[] {
  if (!myId) return [];
  return messages.filter((message) => (message.seq ?? 0) > announcedUpTo && message.senderId !== myId && !message.deletedAt);
}

/** A Message's text as one line, not longer than is bearable to listen to. */
function spokenText(body: string | undefined): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  return text.length > LONGEST_SPOKEN ? `${text.slice(0, LONGEST_SPOKEN)}…` : text;
}

/** What a screen reader says for a new Message: who, then what, on one line and not longer than is bearable. */
export function announcementOf(message: MessageResponse, sender: string): string {
  if (message.attachment) {
    const caption = spokenText(message.body);
    return caption ? `${sender} sent an image: ${caption}` : `${sender} sent an image`;
  }
  return `${sender}: ${spokenText(message.body)}`;
}

/** A line for the live region. `change` tells a Message's later versions apart from its first line. */
export type SpokenLine = { seq: number; text: string; change?: string };

/** Which version of a Message this is: the original, an edit (by when) or a deletion. */
export const versionOf = (message: MessageResponse) => `${message.editedAt ?? ""}|${message.deletedAt ?? ""}`;

/** The Messages already known (by `seq`, with the version seen) that have since been edited or deleted. */
export function changedMessages(known: ReadonlyMap<number, string>, messages: readonly MessageResponse[]): MessageResponse[] {
  return messages.filter((message) => message.seq !== undefined && known.has(message.seq) && known.get(message.seq) !== versionOf(message));
}

/**
 * What to say for Messages that were edited or deleted: who did it, and the new text of someone else's edit. Your own
 * are confirmed without reading your text back. More than a few at once are only counted, like new Messages.
 */
export function changeAnnouncements(
  changed: readonly MessageResponse[],
  nameOf: (senderId: string | undefined) => string,
  myId: string | undefined,
): SpokenLine[] {
  if (changed.length === 0) return [];
  if (changed.length > READ_OUT_UP_TO) {
    return [{ seq: changed.at(-1)?.seq ?? 0, text: `${changed.length} Messages were changed`, change: `many-${changed.at(-1)?.seq ?? 0}-${changed.length}` }];
  }
  return changed.map((message) => {
    const mine = message.senderId === myId;
    const who = mine ? "You" : nameOf(message.senderId);
    const text = message.deletedAt
      ? `${who} deleted a Message`
      : mine
        ? "You edited a Message"
        : `${who} edited a Message: ${spokenText(message.body)}`;
    return { seq: message.seq ?? 0, text, change: versionOf(message) };
  });
}

/**
 * What to say for Messages that have just arrived: each one with who wrote it when there are a few, only how many when
 * there are more than that (a catch-up after a reconnect should not read out a page of text).
 */
export function announcementsFor(
  fresh: readonly MessageResponse[],
  nameOf: (senderId: string | undefined) => string,
): SpokenLine[] {
  if (fresh.length === 0) return [];
  if (fresh.length > READ_OUT_UP_TO) return [{ seq: fresh.at(-1)?.seq ?? 0, text: `${fresh.length} new Messages` }];
  return fresh.map((message) => ({ seq: message.seq ?? 0, text: announcementOf(message, nameOf(message.senderId)) }));
}
