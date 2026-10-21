"use client";

import { useState } from "react";
import type { MessageResponse } from "@/lib/api";
import { announcementsFor, changeAnnouncements, changedMessages, unannounced, versionOf, type SpokenLine } from "./announce";

type Spoken = { upTo: number; lines: SpokenLine[]; versions: ReadonlyMap<number, string>; quiet: boolean };

const KEPT = 5;

const versionsOf = (messages: readonly MessageResponse[]) =>
  new Map(messages.flatMap((message) => (message.seq === undefined ? [] : [[message.seq, versionOf(message)] as const])));

/**
 * What a screen reader should be told as things happen in this Conversation: the lines to put in a polite live region.
 * New Messages from other people are read out, and so is any Message already there that was edited or deleted (your
 * own edits and deletions are confirmed too). The Messages already there when the view opens are not announced, and
 * neither are your own new ones. While `quiet` (a detached window, whose newer Messages arrive by paging forward, not
 * live), and in the one render in which it stops being quiet (the page that reaches the newest Message lands then),
 * newer Messages are noted without being announced; edits and deletions of Messages already shown still are. (State
 * is adjusted while rendering, the way React asks for something derived from props, so no effect is needed.)
 */
export function useAnnouncements(
  confirmed: readonly MessageResponse[],
  loaded: boolean,
  myId: string | undefined,
  nameOf: (senderId: string | undefined) => string,
  quiet = false,
): readonly SpokenLine[] {
  const [spoken, setSpoken] = useState<Spoken>();
  const newest = confirmed.at(-1)?.seq ?? 0;
  if (loaded) {
    const changed = spoken ? changedMessages(spoken.versions, confirmed) : [];
    // Messages not seen before (older ones loaded later, newer ones arriving) are noted, so a later change to them is noticed.
    const unseen = spoken ? confirmed.some((message) => message.seq !== undefined && !spoken.versions.has(message.seq)) : true;
    if (!spoken || newest > spoken.upTo || changed.length > 0 || unseen || spoken.quiet !== quiet) {
      const fresh = spoken && !quiet && !spoken.quiet ? unannounced(confirmed, spoken.upTo, myId) : [];
      setSpoken({
        quiet,
        upTo: Math.max(newest, spoken?.upTo ?? 0),
        lines: [...(spoken?.lines ?? []), ...announcementsFor(fresh, nameOf), ...changeAnnouncements(changed, nameOf, myId)].slice(-KEPT),
        versions: versionsOf(confirmed),
      });
    }
  }
  return spoken?.lines ?? [];
}
