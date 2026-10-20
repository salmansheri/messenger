"use client";

import { useId, useState } from "react";
import { DropdownMenu, MenuItem, useCloseMenu } from "@/components/ui/dropdown-menu";
import { toProblem, type ReactionView } from "@/lib/api";
import { myReaction, REACTIONS, chipName } from "./reactions";
import { useReact, useUnreact } from "./use-reactions";
import { changeFailureMessage } from "./wording";

type Target = { conversationId: string; messageId: string };

/**
 * Choosing a reaction: the same emoji as the person's own takes it away, any other one replaces it (one reaction per
 * person per Message). The two calls are separate on the server so a repeated request cannot flip the state; the
 * toggling is decided here.
 */
function useChooseReaction(target: Target, mine: string | undefined, onProblem: (message: string | undefined) => void) {
  const react = useReact();
  const unreact = useUnreact();
  return {
    pending: react.isPending || unreact.isPending,
    choose(emoji: string, done?: () => void) {
      if (react.isPending || unreact.isPending) return;
      onProblem(undefined);
      const handlers = { onSuccess: done, onError: (error: unknown) => onProblem(changeFailureMessage(toProblem(error))) };
      const path = { conversationId: target.conversationId, messageId: target.messageId };
      if (emoji === mine) unreact.mutate({ path }, handlers);
      else react.mutate({ path, body: { emoji } }, handlers);
    },
  };
}

/** The button beside a Message's options that opens the six reactions. */
export function ReactMenu({
  target,
  whose,
  when,
  reactions,
  myId,
}: {
  target: Target;
  whose: string;
  when: string;
  reactions: ReactionView[];
  myId: string | undefined;
}) {
  const [problem, setProblem] = useState<string>();
  const mine = myReaction(reactions, myId);
  return (
    <DropdownMenu
      label={`React to ${whose} Message at ${when}`}
      icon={<SmileIcon />}
      onClose={() => setProblem(undefined)}
      below={
        problem && (
          <p role="alert" className="px-3 py-2 text-sm text-accent">
            {problem}
          </p>
        )
      }
    >
      <Choices target={target} mine={mine} onProblem={setProblem} />
    </DropdownMenu>
  );
}

function Choices({ target, mine, onProblem }: { target: Target; mine: string | undefined; onProblem: (message: string | undefined) => void }) {
  const close = useCloseMenu();
  const { pending, choose } = useChooseReaction(target, mine, onProblem);
  return (
    <>
      {REACTIONS.map((reaction) => (
        <MenuItem key={reaction.emoji} busy={pending} onSelect={() => choose(reaction.emoji, () => close(true))}>
          <span aria-hidden="true">{reaction.emoji}</span> <span className="capitalize">{reaction.name}</span>
          {mine === reaction.emoji && <span className="text-ink-muted"> (yours: press to remove)</span>}
        </MenuItem>
      ))}
    </>
  );
}

/**
 * What people reacted with, under a Message. Each is a button named for what pressing it does ("React with thumbs up
 * (2)") and pressed when it is the person's own; a Group also shows who chose it, because there it matters, and the name
 * then ends with those words ("React with thumbs up (2): Ada, Linus") so what is seen is part of what is said.
 */
export function ReactionChips({
  target,
  reactions,
  myId,
  nameOf,
  group,
}: {
  target: Target;
  reactions: ReactionView[];
  myId: string | undefined;
  nameOf: (userId: string) => string;
  group: boolean;
}) {
  const [problem, setProblem] = useState<string>();
  const mine = myReaction(reactions, myId);
  const { choose } = useChooseReaction(target, mine, setProblem);
  const id = useId();
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1">
      <ul className="flex flex-wrap gap-1.5" aria-label="Reactions">
        {reactions.map((view, index) => {
          const users = view.userIds ?? [];
          const names = users.map((userId) => (userId === myId ? "You" : nameOf(userId)));
          const pressed = view.emoji === mine;
          const shown = group ? summary(names) : users.length > 1 ? String(users.length) : "";
          return (
            <li key={view.emoji}>
              <button
                type="button"
                aria-pressed={pressed}
                aria-label={group && shown ? `${chipName(view)}: ${shown}` : chipName(view)}
                aria-describedby={`${id}-${index}`}
                onClick={() => view.emoji && choose(view.emoji)}
                className={`inline-flex min-h-6 items-center gap-1 rounded-full border px-2 text-sm text-ink ${
                  pressed ? "border-accent bg-band" : "border-rule hover:bg-surface"
                }`}
              >
                <span aria-hidden="true">{view.emoji}</span>
                {shown && <span aria-hidden="true">{shown}</span>}
              </button>
              <span id={`${id}-${index}`} className="sr-only">
                {names.join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
      {problem && (
        <p role="alert" className="mt-1 text-sm text-accent">
          {problem}
        </p>
      )}
    </div>
  );
}

/** "Ada", "Ada, Grace", "Ada, Grace +2": who chose it, short enough to sit in a small button. */
function summary(names: string[]): string {
  const first = names.slice(0, 2).map((name) => name.split(" ")[0]);
  return names.length > 2 ? `${first.join(", ")} +${names.length - 2}` : first.join(", ");
}

function SmileIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.3 9.6c.6 1 1.5 1.5 2.7 1.5s2.1-.5 2.7-1.5" />
      <circle cx="5.7" cy="6.4" r=".6" fill="currentColor" stroke="none" />
      <circle cx="10.3" cy="6.4" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}
