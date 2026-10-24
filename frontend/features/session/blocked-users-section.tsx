"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { blocksOptions, toProblem, type BlockedUser } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { useBlock } from "@/features/conversations/use-block";
import { BLOCKED_SUMMARY, blockFailureMessage } from "@/features/conversations/wording";
import { Avatar } from "@/features/people/person-avatar";
import { focusAfterRemoval } from "./blocked-users";

type Listed = BlockedUser & { userId: string };

/**
 * The people the signed-in person has blocked, newest first, each with an Unblock button. It is the server's list,
 * kept current by `recordBlock` (an Unblock here, or a Block or Unblock in any of their tabs or devices) and asked for
 * again after a reconnect. After an Unblock focus moves to the next person's Unblock button, the one before, or the
 * empty state.
 */
export function BlockedUsersSection() {
  const blocked = useQuery(blocksOptions());
  const users = (blocked.data ?? []).filter((user): user is Listed => Boolean(user.userId));
  const ids = users.map((user) => user.userId);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const empty = useRef<HTMLParagraphElement>(null);
  // The rows being unblocked here. Focus is moved once one has left the data (the row can unmount before its own
  // success callback would run), and only if it was lost with the row's button, so it never pulls focus from
  // wherever the person has gone since.
  const leaving = useRef(new Set<string>());
  const shown = useRef<string[]>([]);

  useEffect(() => {
    const gone = [...leaving.current].filter((id) => !ids.includes(id));
    if (gone.length > 0) {
      gone.forEach((id) => leaving.current.delete(id));
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost) {
        const next = focusAfterRemoval(shown.current, ids, gone[gone.length - 1]);
        (next ? buttons.current.get(next) : empty.current)?.focus();
      }
    }
    shown.current = ids;
  });

  return (
    <section aria-labelledby="blocked" className="mt-10 border-t border-rule pt-6">
      <h2 id="blocked" className="font-serif text-lg font-semibold">
        Blocked Users
      </h2>
      <p className="mt-2 text-ink-muted">{BLOCKED_SUMMARY}</p>
      {blocked.isPending && (
        <p className="mt-3 text-ink-muted" role="status" aria-busy="true">
          Loading Blocked Users…
        </p>
      )}
      {blocked.isError && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <Notice tone="problem">{messageFor(toProblem(blocked.error))}</Notice>
          <Button variant="quiet" busy={blocked.isFetching} onClick={() => void blocked.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {blocked.data && users.length === 0 && (
        <p ref={empty} tabIndex={-1} className="mt-3">
          You have not blocked anyone.
        </p>
      )}
      {users.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-rule">
          {users.map((user) => (
            <BlockedUserRow
              key={user.userId}
              user={user}
              buttonRef={(element) => {
                if (element) buttons.current.set(user.userId, element);
                else buttons.current.delete(user.userId);
              }}
              onUnblock={() => leaving.current.add(user.userId)}
              onRefused={() => leaving.current.delete(user.userId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockedUserRow({
  user,
  buttonRef,
  onUnblock,
  onRefused,
}: {
  user: Listed;
  buttonRef: (element: HTMLButtonElement | null) => void;
  /** Called when Unblock is pressed (the row leaves the list once the server agrees). */
  onUnblock: () => void;
  /** Called when the server refuses (the row stays). */
  onRefused: () => void;
}) {
  const { unblock } = useBlock(user.userId);
  const [problem, setProblem] = useState<string>();
  const name = user.displayName ?? "Someone";
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar id={user.userId} name={user.displayName} url={user.avatarUrl} />
        <span className="min-w-0 flex-1 truncate font-serif">{name}</span>
        <Button
          ref={buttonRef}
          variant="quiet"
          busy={unblock.isPending}
          aria-label={`Unblock ${name}`}
          onClick={() => {
            setProblem(undefined);
            onUnblock();
            unblock.mutate(
              { path: { userId: user.userId } },
              {
                onError: (error) => {
                  onRefused();
                  setProblem(blockFailureMessage(toProblem(error), "settings"));
                },
              },
            );
          }}
        >
          Unblock
        </Button>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-accent">
          {problem}
        </p>
      )}
    </li>
  );
}
