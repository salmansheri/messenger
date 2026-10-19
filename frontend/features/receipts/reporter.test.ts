import { describe, expect, it } from "vitest";
import type { ReceiptResponse } from "@/lib/api";
import { createReceiptReporter } from "./reporter";

type Sent = { conversationId: string; body: { deliveredSeq?: number; readSeq?: number } };

function setup(options: { failures?: number } = {}) {
  const sent: Sent[] = [];
  const results: [string, ReceiptResponse][] = [];
  let failures = options.failures ?? 0;
  const reporter = createReceiptReporter({
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

  it("forgets a report that failed, so asking again sends it again", async () => {
    const { reporter, sent, results } = setup({ failures: 1 });
    reporter.read("c1", 3);
    await reporter.settled();
    expect(results).toEqual([]);

    reporter.read("c1", 3);
    await reporter.settled();
    expect(sent).toHaveLength(2);
    expect(results).toHaveLength(1);
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
