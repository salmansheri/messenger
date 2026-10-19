import type { MessageResponse } from "@/lib/api";

/** A Message the person has written that the server has not confirmed yet. */
export type Pending = {
  /** Chosen here and reused by every retry, so the server can recognise a repeat and never store a second copy. */
  clientMessageId: string;
  body: string;
  status: "sending" | "failed";
  createdAt: string;
  /** Why the last attempt failed. */
  error?: unknown;
};

type Options = {
  send: (clientMessageId: string, body: string) => Promise<MessageResponse>;
  /** Called with the stored Message once the server confirms it (a repeat's 200 counts like a first 201). */
  onSent: (message: MessageResponse) => void;
  newId?: () => string;
  now?: () => string;
};

/**
 * The optimistic send: a Message shows as sending the moment it is written, goes when the server confirms it, or stays
 * as failed until the person retries it with the same client Message ID. Sends go out one at a time in the order they
 * were written, so the server numbers them in that order; one that failed does not hold back the ones after it.
 * Framework-free so it can be driven by a test and read with `useSyncExternalStore`.
 */
export function createOutbox({
  send,
  onSent,
  newId = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
}: Options) {
  let entries: readonly Pending[] = [];
  let tail: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function set(next: readonly Pending[]) {
    entries = next;
    listeners.forEach((listener) => listener());
  }

  function update(clientMessageId: string, change: (entry: Pending) => Pending | undefined) {
    set(entries.flatMap((entry) => (entry.clientMessageId === clientMessageId ? (change(entry) ?? []) : [entry])));
  }

  async function run(clientMessageId: string) {
    const entry = entries.find((candidate) => candidate.clientMessageId === clientMessageId);
    if (!entry) return;
    let message: MessageResponse;
    try {
      message = await send(clientMessageId, entry.body);
    } catch (error) {
      update(clientMessageId, (current) => ({ ...current, status: "failed", error }));
      return;
    }
    // The stored Message is handed on before the pending one goes, so there is never a moment with neither on screen.
    onSent(message);
    update(clientMessageId, () => undefined);
  }

  function enqueue(clientMessageId: string) {
    tail = tail.then(() => run(clientMessageId));
  }

  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Shows the Message as sending and queues it; returns its client Message ID. */
    submit(body: string): string {
      const clientMessageId = newId();
      set([...entries, { clientMessageId, body, status: "sending", createdAt: now() }]);
      enqueue(clientMessageId);
      return clientMessageId;
    },
    /** Sends a failed Message again with the same client Message ID. Anything else is ignored (a double press sends once). */
    retry(clientMessageId: string) {
      const entry = entries.find((candidate) => candidate.clientMessageId === clientMessageId);
      if (entry?.status !== "failed") return;
      update(clientMessageId, (entry) => ({ ...entry, status: "sending", error: undefined }));
      enqueue(clientMessageId);
    },
    /** Resolves once everything queued so far has been answered. */
    settled: () => tail,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
