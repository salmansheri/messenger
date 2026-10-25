import type { Person, StoryResponse, StoryTray } from "@/lib/api";
import type { StoryEvent } from "@/lib/realtime/events";
import type { ViewerPerson } from "./viewer-machine";

/** One round Avatar in the tray: whose Stories, oldest first, and whether any is unseen. */
export type TrayEntry = {
  userId: string;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  stories: StoryResponse[];
  /** The signed-in person's own entry ("Your Story"). */
  own: boolean;
  unseen: boolean;
};

/** When a person's latest Story was posted (their Stories are oldest first). */
const latest = (entry: TrayEntry) => entry.stories[entry.stories.length - 1]?.createdAt ?? "";

/**
 * The tray in the order it is shown: your own first, then people with Stories you have not seen, the one who posted
 * most recently first, then people whose Stories you have all seen, also newest first. Nobody without a live Story is
 * in it, so with no Stories at all it is empty.
 */
export function orderTray(tray: StoryTray | undefined, me: { id?: string; displayName?: string; avatarUrl?: string } | undefined): TrayEntry[] {
  const entries: TrayEntry[] = [];
  const own = tray?.own ?? [];
  if (own.length > 0 && me?.id) {
    entries.push({ userId: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl, stories: own, own: true, unseen: false });
  }
  const people = (tray?.people ?? [])
    .filter((person): person is Person & { userId: string } => Boolean(person.userId) && (person.stories?.length ?? 0) > 0)
    .map((person): TrayEntry => {
      const stories = person.stories ?? [];
      return {
        userId: person.userId,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        stories,
        own: false,
        unseen: stories.some((story) => !story.seen),
      };
    });
  const newestFirst = (a: TrayEntry, b: TrayEntry) => latest(b).localeCompare(latest(a));
  entries.push(...people.filter((entry) => entry.unseen).sort(newestFirst));
  entries.push(...people.filter((entry) => !entry.unseen).sort(newestFirst));
  return entries;
}

/** The accessible name of a tray entry: who, and whether there is something new. */
export function trayEntryLabel(entry: Pick<TrayEntry, "own" | "displayName" | "unseen">): string {
  if (entry.own) return "Your Story";
  return `${entry.displayName ?? "Someone"}, ${entry.unseen ? "unseen Stories" : "Stories seen"}`;
}

/** The entries as the viewer plays them: who, and per Story whether it is a photo and already seen (your own always are). */
export function viewerPeople(entries: TrayEntry[]): ViewerPerson[] {
  return entries.map((entry) => ({
    userId: entry.userId,
    stories: entry.stories
      .filter((story): story is StoryResponse & { id: string } => Boolean(story.id))
      .map((story) => ({ id: story.id, photo: story.kind === "PHOTO", seen: entry.own || Boolean(story.seen) })),
  }));
}

const byCreation = (a: StoryResponse, b: StoryResponse) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "");

/**
 * Puts a Story event into the loaded tray; the same tray comes back when there is nothing to change (a repeat, or a
 * Story the tray does not have). Your own come from your other tabs and devices, the others' from the people whose
 * audience you are in.
 */
export function applyStoryEvent(tray: StoryTray, event: StoryEvent, myId: string | undefined): StoryTray {
  switch (event.type) {
    case "story.posted": {
      const posted = event.story;
      if (!posted.id) return tray;
      if (event.poster.userId === myId) {
        const own = tray.own ?? [];
        if (own.some((story) => story.id === posted.id)) return tray;
        return { ...tray, own: [...own, posted].sort(byCreation) };
      }
      const people = tray.people ?? [];
      const known = people.find((person) => person.userId === event.poster.userId);
      if (!known) {
        const added: Person = { userId: event.poster.userId, displayName: event.poster.displayName, avatarUrl: event.poster.avatarUrl, stories: [posted] };
        return { ...tray, people: [added, ...people] };
      }
      if (known.stories?.some((story) => story.id === posted.id)) return tray;
      return {
        ...tray,
        people: people.map((person) => (person === known ? { ...person, stories: [...(person.stories ?? []), posted].sort(byCreation) } : person)),
      };
    }
    case "story.removed": {
      if (event.posterId === myId) {
        const own = tray.own ?? [];
        return own.some((story) => story.id === event.storyId) ? { ...tray, own: own.filter((story) => story.id !== event.storyId) } : tray;
      }
      const people = tray.people ?? [];
      const known = people.find((person) => person.userId === event.posterId);
      if (!known?.stories?.some((story) => story.id === event.storyId)) return tray;
      const left = known.stories.filter((story) => story.id !== event.storyId);
      return {
        ...tray,
        people: left.length === 0 ? people.filter((person) => person !== known) : people.map((person) => (person === known ? { ...person, stories: left } : person)),
      };
    }
    case "story.viewed": {
      const own = tray.own ?? [];
      const viewed = own.find((story) => story.id === event.storyId);
      if (!viewed || (viewed.viewCount ?? 0) >= event.viewCount) return tray;
      return { ...tray, own: own.map((story) => (story === viewed ? { ...story, viewCount: event.viewCount } : story)) };
    }
  }
}

/** Marks one of someone else's Stories seen, once its view has been reported. */
export function markSeen(tray: StoryTray, storyId: string): StoryTray {
  const people = tray.people ?? [];
  const owner = people.find((person) => person.stories?.some((story) => story.id === storyId && !story.seen));
  if (!owner) return tray;
  return {
    ...tray,
    people: people.map((person) =>
      person === owner ? { ...person, stories: person.stories?.map((story) => (story.id === storyId ? { ...story, seen: true } : story)) } : person,
    ),
  };
}
