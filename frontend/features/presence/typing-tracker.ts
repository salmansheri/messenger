type Options = {
  /** How long someone counts as typing after the last time they were heard. */
  ttlMs?: number;
};

/** The list for a Conversation where nobody is typing (always the same one, so readers see no change). */
export const NOBODY: readonly string[] = [];

/**
 * Who is typing where, as other people's "typing" and "stopped" notices say. Notices can be lost (the typist's
 * connection drops) so nobody is believed for long: each person is forgotten about six seconds after they were last
 * heard. Framework-free; read with `useSyncExternalStore`.
 */
export function createTypingTracker({ ttlMs = 6_000 }: Options = {}) {
  const expiries = new Map<string, Map<string, number>>();
  const snapshots = new Map<string, readonly string[]>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function changed(conversationId: string) {
    const people = expiries.get(conversationId);
    if (people && people.size > 0) snapshots.set(conversationId, [...people.keys()]);
    else {
      expiries.delete(conversationId);
      snapshots.delete(conversationId);
    }
    listeners.forEach((listener) => listener());
  }

  function arm() {
    clearTimeout(timer);
    let next = Infinity;
    for (const people of expiries.values()) for (const expiry of people.values()) next = Math.min(next, expiry);
    timer = next === Infinity ? undefined : setTimeout(sweep, Math.max(0, next - Date.now()));
  }

  function sweep() {
    const now = Date.now();
    for (const [conversationId, people] of [...expiries]) {
      let any = false;
      for (const [userId, expiry] of people) {
        if (expiry <= now) {
          people.delete(userId);
          any = true;
        }
      }
      if (any) changed(conversationId);
    }
    arm();
  }

  return {
    /** Who is typing in a Conversation, in the order they started. The same list is returned while nothing changes. */
    typing: (conversationId: string): readonly string[] => snapshots.get(conversationId) ?? NOBODY,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Heard that someone is typing (again). */
    started(conversationId: string, userId: string) {
      const people = expiries.get(conversationId) ?? new Map<string, number>();
      const isNew = !people.has(userId);
      people.set(userId, Date.now() + ttlMs);
      expiries.set(conversationId, people);
      if (isNew) changed(conversationId);
      arm();
    },
    /** Heard that someone stopped (or sent). */
    stopped(conversationId: string, userId: string) {
      if (!expiries.get(conversationId)?.delete(userId)) return;
      changed(conversationId);
      arm();
    },
    /** Forgets everybody. */
    clear() {
      const had = [...expiries.keys()];
      expiries.clear();
      had.forEach(changed);
      arm();
    },
  };
}

export type TypingTracker = ReturnType<typeof createTypingTracker>;
