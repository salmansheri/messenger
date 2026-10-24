"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { setAvailabilityMutation, toProblem } from "@/lib/api";
import type { Availability } from "@/lib/realtime/events";
import { AVAILABILITY_NAMES } from "@/features/presence/text";
import { recordAvailability } from "@/features/realtime/sync";
import { availabilityFailureMessage } from "./wording";

const CHOICES: { value: Availability; hint: string }[] = [
  { value: "AVAILABLE", hint: "Nothing extra is shown to others." },
  { value: "BUSY", hint: "Others see that you may not answer soon." },
  { value: "AWAY", hint: "Others see that you are not around." },
];

/**
 * How the person says they can be reached, saved as soon as they choose. What is checked is the value held (which a
 * change in another tab moves, through `recordAvailability`), or a choice that has not been saved yet: a refused one
 * stays checked, with the reason and a way to send it again. Choosing the value already held sends nothing.
 */
export function AvailabilityChooser({ userId, held, labelledBy }: { userId: string; held: Availability; labelledBy: string }) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Availability>();
  const [problem, setProblem] = useState<string>();
  // What was last saved here; "saved" is said only while that is still the value held (another tab may change it).
  const [saved, setSaved] = useState<Availability>();

  const update = useMutation({
    ...setAvailabilityMutation(),
    onMutate: () => {
      setProblem(undefined);
      setSaved(undefined);
    },
    onSuccess: (profile) => {
      const availability = profile.availability ?? "AVAILABLE";
      recordAvailability(queryClient, userId, availability);
      setChosen(undefined);
      setSaved(availability);
    },
    onError: (error) => setProblem(availabilityFailureMessage(toProblem(error))),
  });

  const choose = (availability: Availability) => {
    if (update.isPending) return; // one change at a time, so the answers cannot land out of order
    setSaved(undefined);
    setProblem(undefined);
    if (availability === held) {
      setChosen(undefined);
      return;
    }
    setChosen(availability);
    update.mutate({ body: { availability } });
  };

  const checked = chosen ?? held;
  return (
    <div className="mt-3 flex flex-col gap-4">
      <div role="radiogroup" aria-labelledby={labelledBy} aria-busy={update.isPending || undefined} className="flex flex-col gap-3">
        {CHOICES.map(({ value, hint }) => (
          <label key={value} className="flex items-start gap-3">
            <input
              type="radio"
              name="availability"
              value={value}
              checked={checked === value}
              onChange={() => choose(value)}
              aria-describedby={`availability-${value}-hint`}
              className="mt-1 size-4 accent-accent"
            />
            <span className="flex flex-col">
              <span className="font-medium">{AVAILABILITY_NAMES[value]}</span>
              <span id={`availability-${value}-hint`} className="text-sm text-ink-muted">
                {hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      {problem && (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="problem">{problem}</Notice>
          {chosen && (
            <Button variant="quiet" onClick={() => update.mutate({ body: { availability: chosen } })} busy={update.isPending}>
              Try again
            </Button>
          )}
        </div>
      )}
      <p role="status" className="text-sm text-ink-muted">
        {update.isPending ? "Saving…" : saved && saved === held ? "Availability saved." : ""}
      </p>
    </div>
  );
}
