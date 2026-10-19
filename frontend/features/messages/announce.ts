import type { MessageResponse } from "@/lib/api";

const LONGEST_SPOKEN = 200;

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
