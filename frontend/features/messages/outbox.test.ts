import { describe, expect, it } from "vitest";
import type { MessageResponse } from "@/lib/api";
import { createOutbox } from "./outbox";

const stored = (clientMessageId: string, body: string, seq: number): MessageResponse => ({
  id: `m${seq}`,
  seq,
  clientMessageId,
  body,
  senderId: "me",
});

/** An outbox whose sends are decided by the test: each call to `send` takes the next scripted outcome. */
function setup(outcomes: ("ok" | "fail" | "duplicate")[]) {
  const calls: { clientMessageId: string; body: string }[] = [];
  const confirmed: MessageResponse[] = [];
  let ids = 0;
  const outbox = createOutbox({
    newId: () => `client-${++ids}`,
    now: () => "2026-01-01T10:00:00.000Z",
    send: async (clientMessageId, body) => {
      calls.push({ clientMessageId, body });
      const outcome = outcomes.shift() ?? "ok";
      if (outcome === "fail") throw new Error("network");
      return stored(clientMessageId, body, calls.length);
    },
    onSent: (message) => confirmed.push(message),
  });
  return { outbox, calls, confirmed };
}

describe("the outbox", () => {
  it("shows a Message as sending at once, then removes it when the server confirms it", async () => {
    const { outbox, confirmed } = setup(["ok"]);

    const id = outbox.submit("Hello");
    expect(outbox.getSnapshot()).toEqual([
      { clientMessageId: id, body: "Hello", status: "sending", createdAt: "2026-01-01T10:00:00.000Z" },
    ]);

    await outbox.settled();
    expect(outbox.getSnapshot()).toEqual([]);
    expect(confirmed.map((message) => message.body)).toEqual(["Hello"]);
  });

  it("marks a failed send as failed and keeps what was typed", async () => {
    const { outbox, confirmed } = setup(["fail"]);

    const id = outbox.submit("Hello");
    await outbox.settled();

    const [entry] = outbox.getSnapshot();
    expect(entry).toMatchObject({ clientMessageId: id, body: "Hello", status: "failed" });
    expect(entry.error).toBeInstanceOf(Error);
    expect(confirmed).toEqual([]);
  });

  it("retries with the same client Message ID, so a Message whose answer was lost is never duplicated", async () => {
    const { outbox, calls, confirmed } = setup(["fail", "ok"]);

    const id = outbox.submit("Hello");
    await outbox.settled();
    outbox.retry(id);
    expect(outbox.getSnapshot()[0].status).toBe("sending");
    await outbox.settled();

    expect(calls.map((call) => call.clientMessageId)).toEqual([id, id]);
    expect(calls.map((call) => call.body)).toEqual(["Hello", "Hello"]);
    expect(outbox.getSnapshot()).toEqual([]);
    expect(confirmed).toHaveLength(1);
  });

  it("treats the server's answer to a repeated ID (the same Message again) like any confirmation", async () => {
    const { outbox, confirmed } = setup(["fail", "duplicate"]);

    const id = outbox.submit("Hello");
    await outbox.settled();
    outbox.retry(id);
    await outbox.settled();

    expect(outbox.getSnapshot()).toEqual([]);
    expect(confirmed).toEqual([stored(id, "Hello", 2)]);
  });

  it("ignores a retry of something that is not failed (a double press sends once)", async () => {
    const { outbox, calls } = setup(["fail", "ok"]);

    const id = outbox.submit("Hello");
    await outbox.settled();
    outbox.retry(id);
    outbox.retry(id);
    outbox.retry("unknown");
    await outbox.settled();

    expect(calls).toHaveLength(2);
  });

  it("sends Messages one at a time and in the order they were written", async () => {
    const order: string[] = [];
    let running = 0;
    let overlapped = false;
    const outbox = createOutbox({
      newId: (() => {
        let n = 0;
        return () => `c${++n}`;
      })(),
      now: () => "2026-01-01T10:00:00.000Z",
      send: async (_id, body) => {
        running++;
        overlapped ||= running > 1;
        await new Promise((resolve) => setTimeout(resolve, body === "first" ? 20 : 0));
        order.push(body);
        running--;
        return stored(_id, body, order.length);
      },
      onSent: () => {},
    });

    outbox.submit("first");
    outbox.submit("second");
    outbox.submit("third");
    await outbox.settled();

    expect(order).toEqual(["first", "second", "third"]);
    expect(overlapped).toBe(false);
  });

  it("lets later Messages go out while an earlier one stays failed", async () => {
    const { outbox, confirmed } = setup(["fail", "ok"]);

    outbox.submit("one");
    outbox.submit("two");
    await outbox.settled();

    expect(confirmed.map((message) => message.body)).toEqual(["two"]);
    expect(outbox.getSnapshot().map((entry) => [entry.body, entry.status])).toEqual([["one", "failed"]]);
  });

  it("tells subscribers about every change", async () => {
    const { outbox } = setup(["ok"]);
    let changes = 0;
    const stop = outbox.subscribe(() => changes++);

    outbox.submit("Hello");
    await outbox.settled();
    stop();
    outbox.submit("again");

    expect(changes).toBe(2); // queued, then confirmed
  });
});
