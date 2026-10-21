import type { ConversationResponse, ConversationSettings } from "@/lib/api";
import { glimpse } from "@/features/messages/glimpse";
import { isMuted } from "./settings";

/** How much of an image's caption the list line shows, as the server's pushes and quotes do. */
const PHOTO_CAPTION_CHARACTERS = 100;

/** What a Conversation is called: the other person in a Direct conversation, the name of a Group. */
export function conversationTitle(conversation: ConversationResponse, myId: string | undefined): string {
  if (conversation.type === "GROUP") return conversation.name || "Group";
  const other = conversation.participants?.find((participant) => participant.userId !== myId);
  return other?.displayName || "Conversation";
}

/**
 * Whose disc stands for a Conversation in its row and header: the other person in a Direct conversation (with their
 * Avatar when they have one), or the Group itself, which has no picture and shows the initials of its name.
 */
export function conversationAvatar(conversation: ConversationResponse, myId: string | undefined): { id: string | undefined; name: string; url: string | undefined } {
  const name = conversationTitle(conversation, myId);
  if (conversation.type === "GROUP") return { id: conversation.id, name, url: undefined };
  const other = conversation.participants?.find((participant) => participant.userId !== myId);
  return { id: other?.userId, name, url: other?.avatarUrl };
}

/** The other person in a Direct conversation (the first Participant who is not the viewer). */
export function otherParticipantId(conversation: ConversationResponse, myId: string | undefined): string | undefined {
  return conversation.participants?.find((participant) => participant.userId !== myId)?.userId;
}

/** The latest Message as one short line: who said it where that matters, and nothing if none was sent yet. */
export function lastLine(conversation: ConversationResponse, myId: string | undefined): string {
  const message = conversation.lastMessage;
  if (message?.deletedAt) return "This Message was deleted";
  if (!message?.body && !message?.attachment) return "No Messages yet";
  const text = message.attachment
    ? glimpse(message.body, true, PHOTO_CAPTION_CHARACTERS)
    : (message.body ?? "").replace(/\s+/g, " ").trim();
  if (message.senderId === myId) return `You: ${text}`;
  if (conversation.type === "GROUP") {
    const sender = conversation.participants?.find((participant) => participant.userId === message.senderId);
    if (sender?.displayName) return `${sender.displayName}: ${text}`;
  }
  return text;
}

const calendarDay = (date: Date, timeZone?: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

const dayNumber = (isoDay: string) => Date.parse(`${isoDay}T00:00:00Z`) / 86_400_000;

/**
 * When something happened, the way a list shows it: the time today, "Yesterday", the weekday for the rest of the week,
 * then the date (with the year only when it is not this year). Days are the viewer's, in `timeZone` (default: theirs).
 */
export function formatWhen(iso: string | undefined, now: Date, timeZone?: string): string {
  const date = iso ? new Date(iso) : undefined;
  if (!date || Number.isNaN(date.getTime())) return "";
  const daysAgo = dayNumber(calendarDay(now, timeZone)) - dayNumber(calendarDay(date, timeZone));
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(date);
  if (daysAgo <= 0) return format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return format({ weekday: "short" });
  const sameYear = calendarDay(now, timeZone).slice(0, 4) === calendarDay(date, timeZone).slice(0, 4);
  return format({ day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** The unread mark: nothing when all is read, a count otherwise, capped so it stays small. */
export function unreadLabel(count: number | undefined): string | undefined {
  if (!count || count < 1) return undefined;
  return count > 99 ? "99+" : String(count);
}

/** The unread count in words, for a screen reader (the badge itself is just the number). */
export function unreadSpeech(count: number | undefined): string | undefined {
  if (!count || count < 1) return undefined;
  if (count > 99) return "More than 99 unread Messages";
  return `${count} unread Message${count === 1 ? "" : "s"}`;
}

/** The heading of a day in a Conversation: "Today", "Yesterday", then the weekday and date (the year only when it is not this year). */
export function formatDay(iso: string | undefined, now: Date, timeZone?: string): string {
  const date = iso ? new Date(iso) : undefined;
  if (!date || Number.isNaN(date.getTime())) return "";
  const daysAgo = dayNumber(calendarDay(now, timeZone)) - dayNumber(calendarDay(date, timeZone));
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  const sameYear = calendarDay(now, timeZone).slice(0, 4) === calendarDay(date, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
    .format(date)
    .replace(",", "");
}

/** The time of day as 24-hour hours and minutes, in the viewer's zone. */
export function formatClock(iso: string | undefined, timeZone?: string): string {
  const date = iso ? new Date(iso) : undefined;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

/** When a mute ends, in words that fit after "Muted until": the time today, "tomorrow 08:30", then weekday and date. */
function formatUntil(iso: string, now: Date, timeZone?: string): string {
  const date = new Date(iso);
  const ahead = dayNumber(calendarDay(date, timeZone)) - dayNumber(calendarDay(now, timeZone));
  const clock = formatClock(iso, timeZone);
  if (ahead <= 0) return clock;
  if (ahead === 1) return `tomorrow ${clock}`;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(",", "");
  return `${day}, ${clock}`;
}

/** What is set for a Conversation, on one line: "Pinned · Muted until 20:00 · Archived"; nothing when nothing is. */
export function settingsLine(settings: ConversationSettings | undefined, now: Date, timeZone?: string): string {
  const parts: string[] = [];
  if (settings?.pinned) parts.push("Pinned");
  if (settings && isMuted(settings, now)) {
    parts.push(settings.mutedUntil ? `Muted until ${formatUntil(settings.mutedUntil, now, timeZone)}` : "Muted");
  }
  if (settings?.archived) parts.push("Archived");
  return parts.join(" \u00b7 ");
}
