"use client";

import { useState } from "react";
import type { MessageResponse } from "@/lib/api";
import { announcementsFor, unannounced } from "./announce";

type Spoken = { upTo: number; lines: { seq: number; text: string }[] };

const KEPT = 5;

/**
 * What a screen reader should be told as new Messages from other people arrive in this Conversation: the lines to put in
 * a polite live region. The Messages already there when the view opens are not announced, and neither are your own.
 * (State is adjusted while rendering, the way React asks for something derived from props, so no effect is needed.)
 */
export function useAnnouncements(
  confirmed: readonly MessageResponse[],
  loaded: boolean,
  myId: string | undefined,
  nameOf: (senderId: string | undefined) => string,
): readonly { seq: number; text: string }[] {
  const [spoken, setSpoken] = useState<Spoken>();
  const newest = confirmed.at(-1)?.seq ?? 0;
  if (loaded && (!spoken || newest > spoken.upTo)) {
    const fresh = spoken ? unannounced(confirmed, spoken.upTo, myId) : [];
    setSpoken({
      upTo: Math.max(newest, spoken?.upTo ?? 0),
      lines: [...(spoken?.lines ?? []), ...announcementsFor(fresh, nameOf)].slice(-KEPT),
    });
  }
  return spoken?.lines ?? [];
}
