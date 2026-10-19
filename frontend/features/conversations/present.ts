import type { ConversationResponse } from "@/lib/api";

/** What a Conversation is called: the other person in a Direct conversation, the name of a Group. */
export function conversationTitle(conversation: ConversationResponse, myId: string | undefined): string {
  if (conversation.type === "GROUP") return conversation.name || "Group";
  const other = conversation.participants?.find((participant) => participant.userId !== myId);
  return other?.displayName || "Conversation";
}

/** The other person in a Direct conversation (the first Participant who is not the viewer). */
export function otherParticipantId(conversation: ConversationResponse, myId: string | undefined): string | undefined {
  return conversation.participants?.find((participant) => participant.userId !== myId)?.userId;
}

/** The latest Message as one short line: who said it where that matters, and nothing if none was sent yet. */
export function lastLine(conversation: ConversationResponse, myId: string | undefined): string {
  const message = conversation.lastMessage;
  if (!message?.body) return "No Messages yet";
  const text = message.body.replace(/\s+/g, " ").trim();
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
