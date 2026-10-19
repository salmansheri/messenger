import type { PresenceView } from "@/lib/api";
import { formatClock, formatDay } from "@/features/conversations/present";

/** Where someone is, in words: online, when they were last seen, or just offline if they never have been. */
export function presenceText(view: PresenceView | undefined, now: Date, timeZone?: string): string {
  if (!view) return "";
  if (view.online) return "Online";
  if (!view.lastSeenAt) return "Offline";
  const day = formatDay(view.lastSeenAt, now, timeZone);
  const when = day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return `Last seen ${when} at ${formatClock(view.lastSeenAt, timeZone)}`;
}

/** Who is typing, as a line: one name, two, or the first and how many others. */
export function typingText(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}
