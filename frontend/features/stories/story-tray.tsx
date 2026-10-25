"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Avatar } from "@/features/people/person-avatar";
import { useStoryTray } from "./queries";
import { StoryViewer } from "./story-viewer";
import { trayEntryLabel } from "./tray";

/**
 * The row of round Avatars above the Conversation list: "Your Story" first (with a "+" that opens posting while you
 * have none), then who has Stories, ringed in the accent while any is unseen and in the quiet rule colour once all are
 * seen. Pressing one plays that person's Stories. With nobody else having a Story only your own entry is there.
 */
export function StoryTray() {
  const entries = useStoryTray();
  const [opened, setOpened] = useState<string>();
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Empty only before it is known who you are. The viewer stays mounted while open even if the tray empties: it closes
  // itself when nothing is left to show.
  if (entries.length === 0 && !opened) return null;

  return (
    <>
      {entries.length > 0 && (
        <ul aria-label="Stories" className="flex gap-3 overflow-x-auto px-4 pt-1 pb-3 sm:px-6">
          {entries.map((entry) => (
            <li key={entry.userId} className="shrink-0">
              {entry.own && entry.stories.length === 0 ? (
                // Your own with nothing live: the "+" that opens posting.
                <Link
                  href="/app/stories/new"
                  aria-label={trayEntryLabel(entry)}
                  className="flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-xs text-ink-muted hover:text-ink"
                >
                  <span className="relative rounded-full p-0.5 ring-2 ring-transparent">
                    <Avatar id={entry.userId} name={entry.displayName} url={entry.avatarUrl} />
                    <span aria-hidden className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-sm leading-none font-semibold text-on-accent ring-2 ring-paper">
                      +
                    </span>
                  </span>
                  <span aria-hidden className="w-full truncate text-center font-serif">
                    Your Story
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  ref={(element) => {
                    if (element) buttons.current.set(entry.userId, element);
                    else buttons.current.delete(entry.userId);
                  }}
                  aria-label={trayEntryLabel(entry)}
                  onClick={() => setOpened(entry.userId)}
                  className="flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-xs text-ink-muted hover:text-ink"
                >
                  <span className={`rounded-full p-0.5 ring-2 ${entry.unseen ? "ring-accent" : "ring-rule"}`}>
                    <Avatar id={entry.userId} name={entry.displayName} url={entry.avatarUrl} />
                  </span>
                  <span aria-hidden className="w-full truncate text-center font-serif">
                    {entry.own ? "Your Story" : (entry.displayName?.split(" ")[0] ?? "")}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {opened && (
        <StoryViewer
          entries={entries}
          startWith={opened}
          onClose={(lastShown) => {
            setOpened(undefined);
            // Focus goes to the entry of the person last shown, once the dialog has gone (its own closing would
            // otherwise put focus back on the entry that opened it). Their entry may have left the tray meanwhile.
            requestAnimationFrame(() => (buttons.current.get(lastShown ?? opened) ?? buttons.current.values().next().value)?.focus());
          }}
        />
      )}
    </>
  );
}
