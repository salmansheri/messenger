import type { ReceiptRequest, ReceiptResponse } from "@/lib/api";

type Options = {
  send: (conversationId: string, body: ReceiptRequest) => Promise<ReceiptResponse>;
  /** The server's answer to a report: this person's new positions and unread count. */
  onResult: (conversationId: string, result: ReceiptResponse) => void;
};

type Positions = { delivered: number; read: number };

const valid = (seq: number) => Number.isFinite(seq) && seq > 0;

/**
 * Tells the server how far this person has got in each Conversation. Reports made together are sent as one with the
 * highest positions, a position already reported (or passed by a reported read, since reading counts as receiving) is
 * never sent again, and one that failed is forgotten so asking again retries it. Framework-free so it can be tested.
 */
export function createReceiptReporter({ send, onResult }: Options) {
  const reported = new Map<string, Positions>();
  const pending = new Map<string, Partial<Positions>>();
  const inFlight = new Set<Promise<void>>();
  let scheduled = false;

  const reportedFor = (conversationId: string) => reported.get(conversationId) ?? { delivered: 0, read: 0 };

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  function flush() {
    scheduled = false;
    for (const [conversationId, positions] of pending) {
      pending.delete(conversationId);
      const before = reportedFor(conversationId);
      const body: ReceiptRequest = {};
      if (positions.read !== undefined) body.readSeq = positions.read;
      if (positions.delivered !== undefined && positions.delivered > (positions.read ?? 0)) body.deliveredSeq = positions.delivered;
      if (body.readSeq === undefined && body.deliveredSeq === undefined) continue;

      // Counted as reported at once, so asking again while the request is out does not send it twice.
      reported.set(conversationId, {
        delivered: Math.max(before.delivered, body.deliveredSeq ?? 0, body.readSeq ?? 0),
        read: Math.max(before.read, body.readSeq ?? 0),
      });
      const request = send(conversationId, body).then(
        (result) => onResult(conversationId, result),
        () => void reported.set(conversationId, before),
      );
      inFlight.add(request);
      void request.finally(() => inFlight.delete(request));
    }
  }

  return {
    /** Everything up to `seq` has reached this device. */
    delivered(conversationId: string, seq: number) {
      if (!valid(seq) || seq <= Math.max(reportedFor(conversationId).delivered, reportedFor(conversationId).read)) return;
      const waiting = pending.get(conversationId) ?? {};
      pending.set(conversationId, { ...waiting, delivered: Math.max(waiting.delivered ?? 0, seq) });
      schedule();
    },
    /** Everything up to `seq` has been seen. */
    read(conversationId: string, seq: number) {
      if (!valid(seq) || seq <= reportedFor(conversationId).read) return;
      const waiting = pending.get(conversationId) ?? {};
      pending.set(conversationId, { ...waiting, read: Math.max(waiting.read ?? 0, seq) });
      schedule();
    },
    /** Resolves once every report made so far has been answered. */
    async settled() {
      await Promise.resolve();
      await Promise.all([...inFlight]);
    },
  };
}

export type ReceiptReporter = ReturnType<typeof createReceiptReporter>;
