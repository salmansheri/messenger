import type { PresenceView } from "@/lib/api";
import type { Availability } from "@/lib/realtime/events";

/**
 * A person's presence list with one announcement applied, without touching the old list. Announcements can arrive
 * twice or late: repeating one changes nothing, and a last-seen time never moves backwards.
 */
export function applyPresence(
  views: PresenceView[] | undefined,
  event: { userId: string; online: boolean; lastSeenAt?: string },
): PresenceView[] | undefined {
  const known = views?.find((view) => view.userId === event.userId);
  if (!views || !known) return views;

  if (event.online) {
    return known.online ? views : views.map((view) => (view === known ? { ...view, online: true, lastSeenAt: undefined } : view));
  }
  const earlier = known.lastSeenAt && event.lastSeenAt && Date.parse(event.lastSeenAt) < Date.parse(known.lastSeenAt);
  if (earlier) return views;
  const lastSeenAt = event.lastSeenAt ?? known.lastSeenAt;
  if (!known.online && known.lastSeenAt === lastSeenAt) return views;
  return views.map((view) => (view === known ? { ...view, online: false, lastSeenAt } : view));
}

/** A presence list with someone's new Availability in it; the value already shown, or someone not listed, changes nothing. */
export function applyAvailability(
  views: PresenceView[] | undefined,
  event: { userId: string; availability: Availability },
): PresenceView[] | undefined {
  const known = views?.find((view) => view.userId === event.userId);
  if (!views || !known || known.availability === event.availability) return views;
  return views.map((view) => (view === known ? { ...view, availability: event.availability } : view));
}
