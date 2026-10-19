import type { ReceiptRequest, ReceiptResponse } from "@/lib/api";

type Options = {
  send: (conversationId: string, body: ReceiptRequest) => Promise<ReceiptResponse>;
  /** The server's answer to a report: this person's new positions and unread count. */
  onResult: (conversationId: string, result: ReceiptResponse) => void;
  /** How long to wait before trying a failed report once more. */
  retryDelayMs?: number;
};

type Positions = { delivered: number; read: number };
type Waiting = Partial<Positions> & { attempt: number };

const valid = (seq: number) => Number.isFinite(seq) && seq > 0;
const higher = (a: number | undefined, b: number | undefined) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));

/**
 * Tells the server how far this person has got in each Conversation. Reports made together are sent as one with the
 * highest positions, a position already reported (or passed by a reported read, since reading counts as receiving) is
 * never sent again, and a report that fails is tried once more after a pause (and again whenever it is asked for).
 * Framework-free so it can be tested.
 */
export function createReceiptReporter({ send, onResult, retryDelayMs = 5_000 }: Options) {
  const reported = new Map<string, Positions>();
  const pending = new Map<string, Waiting>();
  const inFlight = new Set<Promise<void>>();
  let scheduled = false;

  const reportedFor = (conversationId: string) => reported.get(conversationId) ?? { delivered: 0, read: 0 };

  function enqueue(conversationId: string, positions: Partial<Positions>, attempt: number) {
    const waiting = pending.get(conversationId);
    pending.set(conversationId, {
      delivered: higher(waiting?.delivered, positions.delivered),
      read: higher(waiting?.read, positions.read),
      attempt: Math.min(waiting?.attempt ?? attempt, attempt),
    });
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  function flush() {
    scheduled = false;
    for (const [conversationId, waiting] of pending) {
      pending.delete(conversationId);
      const body: ReceiptRequest = {};
      if (waiting.read !== undefined) body.readSeq = waiting.read;
      if (waiting.delivered !== undefined && waiting.delivered > (waiting.read ?? 0)) body.deliveredSeq = waiting.delivered;
      if (body.readSeq === undefined && body.deliveredSeq === undefined) continue;

      // Counted as reported at once, so asking again while the request is out does not send it twice.
      const before = reportedFor(conversationId);
      const after = {
        delivered: Math.max(before.delivered, body.deliveredSeq ?? 0, body.readSeq ?? 0),
        read: Math.max(before.read, body.readSeq ?? 0),
      };
      reported.set(conversationId, after);

      const request = send(conversationId, body).then(
        (result) => onResult(conversationId, result),
        () => {
          // Forget only what this report had set: a later one may have raised the positions since.
          const now = reportedFor(conversationId);
          reported.set(conversationId, {
            delivered: now.delivered === after.delivered ? before.delivered : now.delivered,
            read: now.read === after.read ? before.read : now.read,
          });
          if (waiting.attempt < 1) {
            setTimeout(() => {
              if (body.deliveredSeq !== undefined) delivered(conversationId, body.deliveredSeq, waiting.attempt + 1);
              if (body.readSeq !== undefined) read(conversationId, body.readSeq, waiting.attempt + 1);
            }, retryDelayMs);
          }
        },
      );
      inFlight.add(request);
      void request.finally(() => inFlight.delete(request));
    }
  }

  /** Everything up to `seq` has reached this device. */
  function delivered(conversationId: string, seq: number, attempt = 0) {
    const known = reportedFor(conversationId);
    if (valid(seq) && seq > Math.max(known.delivered, known.read)) enqueue(conversationId, { delivered: seq }, attempt);
  }

  /** Everything up to `seq` has been seen. */
  function read(conversationId: string, seq: number, attempt = 0) {
    if (valid(seq) && seq > reportedFor(conversationId).read) enqueue(conversationId, { read: seq }, attempt);
  }

  return {
    delivered,
    read,
    /** Resolves once every report made so far has been answered. */
    async settled() {
      await Promise.resolve();
      await Promise.all([...inFlight]);
    },
  };
}

export type ReceiptReporter = ReturnType<typeof createReceiptReporter>;
