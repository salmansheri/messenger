"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { DotsIcon, DropdownMenu, MenuItem } from "@/components/ui/dropdown-menu";
import { deleteMutation, toProblem, viewersOptions } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { formatWhen } from "@/features/conversations/present";
import { Avatar } from "@/features/people/person-avatar";
import { recordStoryEvent } from "@/features/realtime/sync";
import { seenByText } from "./wording";

/** Mounted only while something is open over the Story, so the Story waits for as long as it is there. */
function Cover({ onCover }: { onCover: (covered: boolean) => void }) {
  useEffect(() => {
    onCover(true);
    return () => onCover(false);
  }, [onCover]);
  return null;
}

/**
 * What the poster has on their own Story in the viewer: "Seen by N" (the tray's count, which `story.viewed` keeps
 * current), which opens who viewed it; a ⋯ menu whose "Delete Story" asks first; and a way to post another. The Story
 * waits while the list or the menu is open.
 */
export function OwnStoryControls({
  storyId,
  posterId,
  viewCount,
  onCover,
  onDeleted,
}: {
  storyId: string;
  posterId: string;
  viewCount: number;
  onCover: (covered: boolean) => void;
  /** The Story is gone and its controls with it: focus has to go somewhere inside the viewer. */
  onDeleted: () => void;
}) {
  const [listing, setListing] = useState(false);
  const seenBy = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div inert={listing} className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-t from-scrim/80 to-transparent p-3 pt-10">
        <button
          ref={seenBy}
          type="button"
          onClick={() => setListing(true)}
          className="rounded-full bg-on-scrim/15 px-4 py-1.5 text-sm text-on-scrim hover:bg-on-scrim/25"
        >
          {seenByText(viewCount)}
        </button>
        <span className="flex items-center gap-2">
          <Link href="/app/stories/new" className="rounded-full px-3 py-1.5 text-sm text-on-scrim underline underline-offset-4 decoration-on-scrim/40">
            Add a Story
          </Link>
          <StoryMenu storyId={storyId} posterId={posterId} onCover={onCover} onDeleted={onDeleted} />
        </span>
      </div>
      {listing && (
        <Viewers
          storyId={storyId}
          viewCount={viewCount}
          onCover={onCover}
          onClose={() => {
            setListing(false);
            seenBy.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Who viewed the Story, newest first, over the Story; the list is asked for again as the count grows. */
function Viewers({ storyId, viewCount, onCover, onClose }: { storyId: string; viewCount: number; onCover: (covered: boolean) => void; onClose: () => void }) {
  const viewers = useQuery(viewersOptions({ path: { storyId } }));
  const { refetch } = viewers;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // A new view: ask for the list again (not when it opens: the query is already fetching then).
  const countShown = useRef(viewCount);
  useEffect(() => {
    if (countShown.current === viewCount) return;
    countShown.current = viewCount;
    void refetch();
  }, [viewCount, refetch]);
  const now = new Date();

  function keyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault(); // closes the list, not the viewer
    event.stopPropagation();
    onClose();
  }

  return (
    <section aria-labelledby="story-viewers-heading" onKeyDown={keyDown} className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl bg-paper text-ink shadow-2xl">
      <Cover onCover={onCover} />
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <h2 id="story-viewers-heading" ref={heading} tabIndex={-1} className="font-serif text-lg">
          {seenByText(viewCount)}
        </h2>
        <Button variant="quiet" className="text-sm" onClick={onClose}>
          Done
        </Button>
      </div>
      <div className="overflow-y-auto px-4 py-2">
        {viewers.isPending && (
          <p role="status" aria-busy="true" className="py-4 text-ink-muted">
            Loading who saw it…
          </p>
        )}
        {viewers.isError && <p role="alert" className="py-4 text-accent">{messageFor(toProblem(viewers.error))}</p>}
        {viewers.data && viewers.data.length === 0 && <p className="py-4 text-ink-muted">Nobody has seen it yet.</p>}
        {viewers.data && viewers.data.length > 0 && (
          <ul className="flex flex-col">
            {viewers.data.map((viewer) => (
              <li key={viewer.userId} className="flex items-center gap-3 py-2">
                <Avatar id={viewer.userId} name={viewer.displayName} url={viewer.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-serif">{viewer.displayName}</span>
                <span className="font-mono text-xs text-ink-muted">{formatWhen(viewer.viewedAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** The ⋯ menu on your own Story: "Delete Story", which asks first, as Delete for everyone does. */
function StoryMenu({
  storyId,
  posterId,
  onCover,
  onDeleted,
}: {
  storyId: string;
  posterId: string;
  onCover: (covered: boolean) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const remove = useMutation({
    ...deleteMutation(),
    // Out of the tray at once: the viewer moves on to the next Story, or closes (the event for it also arrives).
    onSuccess: () => {
      recordStoryEvent(queryClient, { type: "story.removed", storyId, posterId });
      onDeleted();
    },
    onError: (error) => setProblem(messageFor(error)),
  });
  // Focus follows the question: onto Cancel when it opens, back to "Delete Story" when it is cancelled.
  const focusCancel = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const returnToAsk = useRef(false);
  const focusAsk = useCallback((element: HTMLElement | null) => {
    if (element && returnToAsk.current) {
      returnToAsk.current = false;
      element.focus();
    }
  }, []);

  return (
    <DropdownMenu
      label="Options for your Story"
      icon={<DotsIcon />}
      triggerClassName="rounded-full text-on-scrim hover:bg-on-scrim/15"
      onClose={() => {
        setAsking(false);
        setProblem(undefined);
      }}
      replacement={
        asking ? (
          <div className="flex flex-col gap-3 p-3 text-ink">
            <p className="text-sm">Delete this Story? It goes for everyone at once.</p>
            <div className="flex gap-2">
              <Button
                busy={remove.isPending}
                onClick={() => {
                  setProblem(undefined);
                  remove.mutate({ path: { storyId } });
                }}
              >
                Delete Story
              </Button>
              <Button
                variant="quiet"
                ref={focusCancel}
                onClick={() => {
                  returnToAsk.current = true;
                  setAsking(false);
                  setProblem(undefined);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : undefined
      }
      below={
        <>
          <Cover onCover={onCover} />
          {problem && (
            <p role="alert" className="px-3 py-2 text-sm text-accent">
              {problem}
            </p>
          )}
        </>
      }
    >
      <MenuItem ref={focusAsk} onSelect={() => setAsking(true)}>
        Delete Story
      </MenuItem>
    </DropdownMenu>
  );
}
