"use client";

import type { Ref } from "react";

/**
 * The button that opens and closes a search (focus comes back to it on close): in the open Conversation's header, and
 * on the Conversation list for all of them; `label` says which.
 */
export function SearchToggle({
  open,
  onToggle,
  label = "Search this Conversation",
  ref,
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={open}
      onClick={onToggle}
      className="flex size-9 items-center justify-center rounded-sm text-ink-muted hover:text-ink"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" strokeLinecap="round" />
      </svg>
    </button>
  );
}
