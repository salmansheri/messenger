import type { PresenceView } from "@/lib/api";
import type { Availability } from "@/lib/realtime/events";
import { formatClock, formatDay } from "@/features/conversations/present";

/** Each Availability as it is named on screen. */
export const AVAILABILITY_NAMES: Record<Availability, string> = { AVAILABLE: "Available", BUSY: "Busy", AWAY: "Away" };

/**
 * Where someone is, in words: online, when they were last seen, or just offline if they never have been, after
 * "Busy · " or "Away · " when they said so (available, the default, adds nothing).
 */
export function presenceText(view: PresenceView | undefined, now: Date, timeZone?: string): string {
  if (!view) return "";
  const said = view.availability && view.availability !== "AVAILABLE" ? `${AVAILABILITY_NAMES[view.availability]} · ` : "";
  return said + whereabouts(view, now, timeZone);
}

function whereabouts(view: PresenceView, now: Date, timeZone?: string): string {
  if (view.online) return "Online";
  if (!view.lastSeenAt) return "Offline";
  const day = formatDay(view.lastSeenAt, now, timeZone);
  const when = day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return `Last seen ${when} at ${formatClock(view.lastSeenAt, timeZone)}`;
}

/** "Grace is busy." above the writing box in a Direct conversation; nothing when they are available or it is not known. */
export function availabilityNotice(name: string, availability: Availability | undefined): string {
  if (!availability || availability === "AVAILABLE") return "";
  return `${name} is ${AVAILABILITY_NAMES[availability].toLowerCase()}.`;
}

/** Who is typing, as a line: one name, two, or the first and how many others. */
export function typingText(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}
