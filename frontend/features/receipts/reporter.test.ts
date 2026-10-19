import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptResponse } from "@/lib/api";
import { createReceiptReporter } from "./reporter";

type Sent = { conversationId: string; body: { deliveredSeq?: number; readSeq?: number } };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(options: { failures?: number } = {}) {
  const sent: Sent[] = [];
  const results: [string, ReceiptResponse][] = [];
  let failures = options.failures ?? 0;
  const reporter = createReceiptReporter({
    retryDelayMs: 5_000,
    send: async (conversationId, body) => {
      sent.push({ conversationId, body });
      if (failures-- > 0) throw new Error("network");
      return { deliveredSeq: body.deliveredSeq, readSeq: body.readSeq, unreadCount: 0 };
    },
    onResult: (conversationId, result) => results.push([conversationId, result]),
  });
  return { reporter, sent, results };
}

describe("the receipt reporter", () => {
  it("reports a Message as delivered", async () => {
    const { reporter, sent } = setup();
    reporter.delivered("c1", 4);
    await reporter.settled();
    expect(sent).toEqual([{ conversationId: "c1", body: { deliveredSeq: 4 } }]);
  });

  it("sends one report with the highest position when several arrive together", async () => {
    const { reporter, sent } = setup();
    reporter.delivered("c1", 4);
    reporter.delivered("c1", 7);
    reporter.delivered("c1", 5);
    reporter.read("c1", 3);
    reporter.read("c1", 6);
    await reporter.settled();
    expect(sent).toEqual([{ conversationId: "c1", body: { deliveredSeq: 7, readSeq: 6 } }]);
  });

  it("keeps Conversations apart", async () => {
    const { reporter, sent } = setup();
    reporter.delivered("c1", 4);
    reporter.delivered("c2", 9);
    await reporter.settled();
    expect(sent.map((s) => [s.conversationId, s.body.deliveredSeq]).sort()).toEqual([
      ["c1", 4],
      ["c2", 9],
    ]);
  });

  it("does not repeat a position it has already reported, or a lower one", async () => {
    const { reporter, sent } = setup();
    reporter.read("c1", 6);
    await reporter.settled();
    reporter.read("c1", 6);
    reporter.read("c1", 2);
    reporter.delivered("c1", 5); // reading 6 already counts as delivering up to 6
    await reporter.settled();
    expect(sent).toHaveLength(1);

    reporter.read("c1", 7);
    await reporter.settled();
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toEqual({ readSeq: 7 });
  });

  it("hands the server's answer on (the unread count it worked out)", async () => {
    const { reporter, results } = setup();
    reporter.read("c1", 3);
    await reporter.settled();
    expect(results).toEqual([["c1", { deliveredSeq: undefined, readSeq: 3, unreadCount: 0 }]]);
  });

  it("tries a failed report again after a pause, on its own", async () => {
    const { reporter, sent, results } = setup({ failures: 1 });
    reporter.read("c1", 3);
    await reporter.settled();
    expect(results).toEqual([]);

    await vi.advanceTimersByTimeAsync(5_000);
    await reporter.settled();

    expect(sent.map((s) => s.body)).toEqual([{ readSeq: 3 }, { readSeq: 3 }]);
    expect(results).toHaveLength(1);
  });

  it("gives up after one retry, but asking again later still sends it", async () => {
    const { reporter, sent } = setup({ failures: 2 });
    reporter.read("c1", 3);
    await reporter.settled();
    await vi.advanceTimersByTimeAsync(5_000);
    await reporter.settled();
    await vi.advanceTimersByTimeAsync(60_000);
    await reporter.settled();
    expect(sent, "no endless retrying").toHaveLength(2);

    reporter.read("c1", 3);
    await reporter.settled();
    expect(sent).toHaveLength(3);
  });

  it("does not resend a position that a later report has covered in the meantime", async () => {
    const { reporter, sent } = setup({ failures: 1 });
    reporter.read("c1", 3);
    await reporter.settled();
    reporter.read("c1", 8);
    await reporter.settled();
    await vi.advanceTimersByTimeAsync(5_000);
    await reporter.settled();
    expect(sent.map((s) => s.body)).toEqual([{ readSeq: 3 }, { readSeq: 8 }]);
  });

  it("when an earlier report fails after a later one succeeded, the later position is still remembered", async () => {
    const order: ((ok: boolean) => void)[] = [];
    const sent: number[] = [];
    const reporter = createReceiptReporter({
      retryDelayMs: 1_000_000,
      send: (_id, body) =>
        new Promise((resolve, reject) => {
          sent.push(body.readSeq ?? 0);
          order.push((ok) => (ok ? resolve({ readSeq: body.readSeq, unreadCount: 0 }) : reject(new Error("x"))));
        }),
      onResult: () => {},
    });
    reporter.read("c1", 5);
    await Promise.resolve();
    await Promise.resolve();
    reporter.read("c1", 8);
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([5, 8]);

    order[1](true); // 8 got through
    await Promise.resolve();
    order[0](false); // 5 then failed
    await vi.advanceTimersByTimeAsync(0);

    reporter.read("c1", 8);
    reporter.read("c1", 6);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent, "8 and 6 are already covered by the report that succeeded").toEqual([5, 8]);
  });

  it("ignores positions that make no sense", async () => {
    const { reporter, sent } = setup();
    reporter.delivered("c1", 0);
    reporter.read("c1", -1);
    reporter.read("c1", Number.NaN);
    await reporter.settled();
    expect(sent).toEqual([]);
  });
});
