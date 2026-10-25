"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { sdk } from "@/lib/api";
import { formatWhen } from "@/features/conversations/present";
import type { AvatarTone } from "@/features/people/avatar";
import { Avatar, TONES } from "@/features/people/person-avatar";
import { useImageRecovery } from "@/features/messages/use-image-recovery";
import { recordStorySeen } from "@/features/realtime/sync";
import { OwnStoryControls } from "./own-story-controls";
import { StoryReplyBox } from "./story-reply-box";
import { useTrayRefresh } from "./queries";
import { viewerPeople, type TrayEntry } from "./tray";
import { STORY_MS, current, openViewer, step } from "./viewer-machine";
import { photoAlternative, storySummary } from "./wording";

/** How often the timer moves; the bar fills smoothly enough at this rate. */
const TICK_MS = 100;
/** A press longer than this is a hold (pause while pressed), not a tap (next or previous). */
const HOLD_MS = 250;

/**
 * Plays Stories full screen in the browser's own modal dialog, in the manner of the image viewer: starting at
 * `startWith`'s first unseen Story, each shown for five seconds (a photo's time starts once it has loaded), then the
 * next person's, closing after the last. Tap the right or left side (or use the arrow keys) to go forward or back; press
 * and hold, Space or the Pause button to pause. `onClose` is told whose Story was shown last, so focus can go back to
 * their tray entry.
 */
export function StoryViewer({
  entries,
  startWith,
  onClose,
}: {
  entries: TrayEntry[];
  startWith: string;
  onClose: (lastShown: string | undefined) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(step, undefined, () => openViewer(viewerPeople(entries), startWith));
  const shown = current(state);
  // Whose Story was shown last, for `onClose`: kept after the viewer has closed and nothing is shown any more.
  const lastShown = useRef(shown?.userId);
  const shownUser = shown?.userId;
  useEffect(() => {
    if (shownUser) lastShown.current = shownUser;
  }, [shownUser]);
  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    onClose(lastShown.current);
  };

  // The tray as it is now: Stories that came or went while the viewer is open.
  useEffect(() => dispatch({ type: "sync", people: viewerPeople(entries) }), [entries]);

  // Opened once; removing the element closes it (see ImageViewer).
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    closeButton.current?.focus(); // first, as in the image viewer (showModal would pick the first button, Pause)
  }, []);

  // After the last Story (or when nothing is left to show) the viewer closes by itself.
  useEffect(() => {
    if (state.closed) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the move into "closed" matters
  }, [state.closed]);

  // The timer: real time passed, in small steps; the machine decides whether it counts.
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      // Time in a hidden tab does not count: nobody is watching, and nothing should be reported as seen.
      if (document.visibilityState === "visible") dispatch({ type: "tick", ms: now - last });
      last = now;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const found = useMemo(() => {
    if (!shown) return undefined;
    const entry = entries.find((candidate) => candidate.userId === shown.userId);
    const story = entry?.stories.find((candidate) => candidate.id === shown.storyId);
    return entry && story ? { entry, story } : undefined;
  }, [entries, shown]);

  // A view is reported once per Story shown (never for your own, nor for one already seen). Keyed by the id alone: the
  // objects around it are new on every tick. A report that fails is not sent again while the viewer is open.
  const reportable = found && state.ready && !found.entry.own && !found.story.seen ? found.story.id : undefined;
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (!reportable || reported.current.has(reportable)) return;
    reported.current.add(reportable);
    sdk
      .view({ path: { storyId: reportable } })
      .then(() => recordStorySeen(queryClient, reportable))
      .catch(() => {}); // the Story just stays unseen in the tray
  }, [reportable, queryClient]);

  // A press: held long enough it pauses while held; a short one is a tap, handled by the side buttons' click.
  const pressedAt = useRef<number | undefined>(undefined);
  const wasHold = useRef(false);
  const press = () => {
    pressedAt.current = performance.now();
    wasHold.current = false;
    dispatch({ type: "hold", held: true });
  };
  const release = () => {
    if (pressedAt.current === undefined) return;
    wasHold.current = performance.now() - pressedAt.current > HOLD_MS;
    pressedAt.current = undefined;
    dispatch({ type: "hold", held: false });
  };
  const tap = (direction: "next" | "previous") => {
    if (wasHold.current) {
      wasHold.current = false; // the end of a hold, not a tap
      return;
    }
    dispatch({ type: direction });
  };

  // Something open over the Story (the list of viewers, the menu on your own) holds it, and keys are left to it.
  const cover = useCallback((covered: boolean) => dispatch({ type: "cover", covered }), []);

  const name = found ? (found.entry.own ? "You" : (found.entry.displayName ?? "Someone")) : "";
  const when = found?.story.createdAt ? formatWhen(found.story.createdAt, new Date()) : "";
  const summary = found && shown ? storySummary({ own: found.entry.own, name, index: shown.index, count: shown.count, when }) : "";
  const progress = state.ready ? Math.min(1, state.elapsed / STORY_MS) : 0;

  return (
    <dialog
      ref={dialog}
      aria-label={found?.entry.own ? "Your Stories" : `${name}'s Stories`}
      onClose={close}
      onKeyDown={(event) => {
        if (state.covered) return;
        if (event.key === "ArrowRight") dispatch({ type: "next" });
        else if (event.key === "ArrowLeft") dispatch({ type: "previous" });
        else if (event.key === " ") {
          event.preventDefault(); // Space pauses, whatever has focus
          dispatch({ type: "togglePause" });
        } else return;
        event.stopPropagation();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 text-on-scrim backdrop:bg-transparent"
    >
      <div className="viewer-fade relative flex h-full w-full items-center justify-center bg-scrim/80 backdrop-blur-2xl backdrop-saturate-150 sm:p-6">
        {found && shown && (
          <section className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-scrim sm:rounded-2xl">
            <div className="absolute inset-x-0 top-0 z-20 flex flex-col gap-3 bg-gradient-to-b from-scrim/70 to-transparent p-3 pb-6">
              <div aria-hidden className="flex gap-1">
                {Array.from({ length: shown.count }, (_, index) => (
                  <span key={index} className="h-0.5 flex-1 overflow-hidden rounded-full bg-on-scrim/30">
                    <span
                      className="block h-full bg-on-scrim"
                      style={{ width: `${index < shown.index ? 100 : index === shown.index ? progress * 100 : 0}%` }}
                    />
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Avatar id={found.entry.userId} name={found.entry.displayName} url={found.entry.avatarUrl} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-serif font-medium">{found.entry.own ? "Your Story" : name}</span>
                  <span className="font-mono text-xs text-on-scrim/70"> · {when}</span>
                </p>
                <button
                  type="button"
                  aria-label={state.paused ? "Play" : "Pause"}
                  title={state.paused ? "Play" : "Pause"}
                  onClick={() => dispatch({ type: "togglePause" })}
                  className="flex size-9 items-center justify-center rounded-full text-on-scrim hover:bg-on-scrim/15"
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    {state.paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
                  </svg>
                </button>
                <button
                  ref={closeButton}
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={close}
                  className="flex size-9 items-center justify-center rounded-full text-on-scrim hover:bg-on-scrim/15"
                >
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </div>

            <p role="status" className="sr-only">
              {summary}
            </p>

            <div
              className="relative flex-1"
              onPointerDown={press}
              onPointerUp={release}
              onPointerCancel={release}
              onPointerLeave={release}
            >
              <div key={found.story.id} className="viewer-in absolute inset-0">
                {found.story.kind === "PHOTO" && found.story.attachment?.url ? (
                  <StoryPhoto
                    src={found.story.attachment.url}
                    alt={photoAlternative(found.entry.own ? "you" : name, found.story.text)}
                    caption={found.story.text}
                    onLoaded={() => found.story.id && dispatch({ type: "loaded", storyId: found.story.id })}
                    onRetry={() => closeButton.current?.focus()}
                  />
                ) : (
                  <div className={`flex h-full items-center justify-center p-8 text-ink ${TONES[(found.story.tone ?? "SEA").toLowerCase() as AvatarTone]}`}>
                    <p className="text-center font-serif text-2xl leading-snug break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {found.story.text}
                    </p>
                  </div>
                )}
              </div>
              {/* The sides: left goes back, the rest goes on. Buttons, so a keyboard and a screen reader can use them too. */}
              <button type="button" aria-label="Previous Story" onClick={() => tap("previous")} className="absolute inset-y-0 left-0 z-10 w-1/3 focus-visible:outline-offset-[-4px]" />
              <button type="button" aria-label="Next Story" onClick={() => tap("next")} className="absolute inset-y-0 right-0 z-10 w-2/3 focus-visible:outline-offset-[-4px]" />
            </div>
            {found.entry.own && found.story.id && (
              <OwnStoryControls
                storyId={found.story.id}
                posterId={found.entry.userId}
                viewCount={found.story.viewCount ?? 0}
                onCover={cover}
                onDeleted={() => requestAnimationFrame(() => closeButton.current?.focus())}
              />
            )}
            {!found.entry.own && found.story.id && (
              <StoryReplyBox
                key={found.entry.userId}
                storyId={found.story.id}
                posterId={found.entry.userId}
                posterName={found.entry.displayName}
                onCover={cover}
              />
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}

/** A photo Story: its time starts once it has loaded, and a link that ran out is recovered by asking for the tray again. */
function StoryPhoto({
  src,
  alt,
  caption,
  onLoaded,
  onRetry,
}: {
  src: string;
  alt: string;
  caption: string | undefined;
  onLoaded: () => void;
  /** After Retry, which goes away: focus has to stay inside the dialog. */
  onRetry: () => void;
}) {
  const refresh = useTrayRefresh();
  const picture = useImageRecovery(src, refresh);
  if (picture.status === "failed") {
    return (
      <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p>Couldn&apos;t load the photo.</p>
        <button
          type="button"
          onClick={() => {
            picture.retry();
            onRetry();
          }}
          className="relative z-20 rounded-full bg-on-scrim px-5 py-2 text-sm font-medium text-scrim hover:opacity-90"
        >
          Retry<span className="sr-only"> loading the photo</span>
        </button>
      </div>
    );
  }
  return (
    <figure className="flex h-full flex-col items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to our own file endpoint, not an optimisable asset */}
      <img
        key={picture.attempt}
        src={src}
        alt={alt}
        onLoad={() => {
          picture.onLoad();
          onLoaded();
        }}
        onError={picture.onError}
        className="max-h-full w-full object-contain"
      />
      {caption && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim/80 to-transparent p-5 pt-12 text-center text-sm leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
