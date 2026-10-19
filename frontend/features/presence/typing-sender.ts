type Options = {
  /** Tells the others that the person is typing (`true`) or has stopped (`false`). */
  publish: (typing: boolean) => void;
  /** How often to say "typing" again while the person is still typing. */
  repeatMs?: number;
  /** How long without a keystroke counts as having stopped. */
  idleMs?: number;
};

/**
 * Shares the person's own typing without flooding: "typing" on the first keystroke, a reminder every few seconds for as
 * long as they have not stopped (the others forget a typist after six seconds without news, so a pause must not let
 * the line lapse), and "stopped" when they stop, empty the box, send or leave. Framework-free so it can be tested.
 */
export function createTypingSender({ publish, repeatMs = 3_000, idleMs = 4_000 }: Options) {
  let typing = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let reminder: ReturnType<typeof setTimeout> | undefined;

  function remind() {
    reminder = setTimeout(() => {
      publish(true);
      remind();
    }, repeatMs);
  }

  function stop() {
    clearTimeout(idle);
    clearTimeout(reminder);
    idle = reminder = undefined;
    if (!typing) return;
    typing = false;
    publish(false);
  }

  return {
    /** The person typed something. */
    keystroke() {
      if (!typing) {
        typing = true;
        publish(true);
        remind();
      }
      clearTimeout(idle);
      idle = setTimeout(stop, idleMs);
    },
    /** The person stopped, emptied the box, sent or left. Says so only if "typing" had been said. */
    stop,
  };
}

export type TypingSender = ReturnType<typeof createTypingSender>;
