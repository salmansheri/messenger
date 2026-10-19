"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Walks through `durations` once (each is how long to stay on that step, in milliseconds) and stops on the last. With
 * `reduced` it starts there, so a person who asks for less motion sees the finished frame at once.
 */
export function useSequence(durations: readonly number[], reduced: boolean, startAfterMs = 0): number {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (reduced) return;
    const wait = step === -1 ? startAfterMs : durations[step];
    if (step >= durations.length) return;
    const timer = setTimeout(() => setStep((current) => current + 1), wait);
    return () => clearTimeout(timer);
  }, [step, durations, reduced, startAfterMs]);
  return reduced ? durations.length : Math.max(step, 0);
}

/**
 * Goes round `durations` for as long as `running` (so a demo that is off screen rests), and sits on its last step, the
 * most complete frame, when the person asks for less motion.
 */
export function useLoop(durations: readonly number[], running: boolean, reduced: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!running || reduced) return;
    const timer = setTimeout(() => setStep((current) => (current + 1) % durations.length), durations[step]);
    return () => clearTimeout(timer);
  }, [running, reduced, step, durations]);
  return reduced ? durations.length - 1 : step;
}

const minute = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The viewer's own time (24-hour, to the minute), or nothing while the page is rendered on the server. */
export function useClock(): string {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, 15_000);
      return () => clearInterval(timer);
    },
    minute,
    () => "",
  );
}
