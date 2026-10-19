type Options = {
  /** Tells the others that the person is typing (`true`) or has stopped (`false`). */
  publish: (typing: boolean) => void;
  /** How often to say "typing" again while the person keeps typing. */
  repeatMs?: number;
  /** How long without a keystroke counts as having stopped. */
  idleMs?: number;
};

/**
 * Shares the person's own typing without flooding: "typing" on the first keystroke and then at most every few seconds
 * while it goes on (the others treat it as stale after a few more), and "stopped" when they stop, empty the box or
 * send. Framework-free so it can be tested.
 */
export function createTypingSender({ publish, repeatMs = 3_000, idleMs = 4_000 }: Options) {
  let typing = false;
  let lastStart = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    clearTimeout(idle);
    idle = undefined;
    if (!typing) return;
    typing = false;
    publish(false);
  }

  return {
    /** The person typed something. */
    keystroke() {
      const now = Date.now();
      if (!typing || now - lastStart >= repeatMs) {
        publish(true);
        typing = true;
        lastStart = now;
      }
      clearTimeout(idle);
      idle = setTimeout(stop, idleMs);
    },
    /** The person stopped, emptied the box, sent or left. Says so only if "typing" had been said. */
    stop,
  };
}

export type TypingSender = ReturnType<typeof createTypingSender>;
