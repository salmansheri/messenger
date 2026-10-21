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
function setup(outcomes: ("ok" | "fail" | "duplicate")[], uploads: ("ok" | "fail")[] = []) {
  const calls: { clientMessageId: string; body?: string; replyToMessageId?: string; attachmentId?: string }[] = [];
  const uploaded: File[] = [];
  const released: string[] = [];
  const confirmed: MessageResponse[] = [];
  let ids = 0;
  const outbox = createOutbox({
    newId: () => `client-${++ids}`,
    now: () => "2026-01-01T10:00:00.000Z",
    upload: async (file) => {
      uploaded.push(file);
      if ((uploads.shift() ?? "ok") === "fail") throw new Error("upload failed");
      return { id: `upload-${uploaded.length}` };
    },
    send: async (clientMessageId, body, replyToMessageId, attachmentId) => {
      calls.push({ clientMessageId, body, replyToMessageId, attachmentId });
      const outcome = outcomes.shift() ?? "ok";
      if (outcome === "fail") throw new Error("network");
      return stored(clientMessageId, body ?? "", calls.length);
    },
    release: (previewUrl) => released.push(previewUrl),
    onSent: (message) => confirmed.push(message),
  });
  return { outbox, calls, confirmed, uploaded, released };
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
      upload: async () => ({ id: "unused" }),
      send: async (_id, body = "") => {
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

  it("sends a reply with the Message it answers, shows the quote while it is sending, and reuses the target on every retry", async () => {
    const { outbox, calls } = setup(["fail", "ok"]);
    const answering = { messageId: "q1", senderId: "ada", text: "Are you free?", deleted: false, unavailable: false };

    const id = outbox.submit("Yes", answering);
    expect(outbox.getSnapshot()[0].replyTo).toEqual(answering);
    await outbox.settled();
    expect(outbox.getSnapshot()[0]).toMatchObject({ status: "failed", replyTo: answering });

    outbox.retry(id);
    await outbox.settled();

    expect(calls.map((c) => [c.clientMessageId, c.replyToMessageId])).toEqual([[id, "q1"], [id, "q1"]]);
  });

  it("sends a Message that answers nothing without a target", async () => {
    const { outbox, calls } = setup(["ok"]);

    outbox.submit("Hello");
    await outbox.settled();

    expect(calls[0].replyToMessageId).toBeUndefined();
  });

  describe("with an image", () => {
    const photo = { file: new File(["x"], "cat.png", { type: "image/png" }), previewUrl: "blob:cat", width: 64, height: 48 };

    it("shows it at once with its preview, uploads it first and sends the Message with the upload's id", async () => {
      const { outbox, calls, uploaded, confirmed } = setup(["ok"]);

      const id = outbox.submit("Lunch", undefined, photo);
      expect(outbox.getSnapshot()[0]).toMatchObject({ status: "sending", body: "Lunch", image: { previewUrl: "blob:cat", width: 64 } });
      await outbox.settled();

      expect(uploaded).toEqual([photo.file]);
      expect(calls).toEqual([{ clientMessageId: id, body: "Lunch", replyToMessageId: undefined, attachmentId: "upload-1" }]);
      expect(confirmed).toHaveLength(1);
      expect(outbox.getSnapshot()).toEqual([]);
    });

    it("sends an image without a caption with no text at all", async () => {
      const { outbox, calls } = setup(["ok"]);

      outbox.submit("", undefined, photo);
      await outbox.settled();

      expect(calls[0].body).toBeUndefined();
      expect(calls[0].attachmentId).toBe("upload-1");
    });

    it("hands back the preview once the Message is sent, and not before", async () => {
      const { outbox, released } = setup(["fail", "ok"]);

      const id = outbox.submit("", undefined, photo);
      await outbox.settled();
      expect(released).toEqual([]);

      outbox.retry(id);
      await outbox.settled();
      expect(released).toEqual(["blob:cat"]);
    });

    it("fails at the upload, keeps the image and says it was the upload that failed", async () => {
      const { outbox, calls } = setup([], ["fail"]);

      outbox.submit("Lunch", undefined, photo);
      await outbox.settled();

      expect(outbox.getSnapshot()[0]).toMatchObject({ status: "failed", failedAt: "upload", image: { previewUrl: "blob:cat" } });
      expect(calls).toEqual([]);
    });

    it("uploads again on retry when the upload had failed, with the same client Message ID", async () => {
      const { outbox, calls, uploaded } = setup(["ok"], ["fail", "ok"]);

      const id = outbox.submit("Lunch", undefined, photo);
      await outbox.settled();
      outbox.retry(id);
      await outbox.settled();

      expect(uploaded).toHaveLength(2);
      expect(calls).toEqual([{ clientMessageId: id, body: "Lunch", replyToMessageId: undefined, attachmentId: "upload-2" }]);
      expect(outbox.getSnapshot()).toEqual([]);
    });

    it("does not upload again on retry when only the sending failed, and reuses the upload and the Client message ID", async () => {
      const { outbox, calls, uploaded } = setup(["fail", "ok"]);

      const id = outbox.submit("Lunch", undefined, photo);
      await outbox.settled();
      expect(outbox.getSnapshot()[0]).toMatchObject({ status: "failed", failedAt: "send", image: { attachmentId: "upload-1" } });
      outbox.retry(id);
      await outbox.settled();

      expect(uploaded).toHaveLength(1);
      expect(calls.map((c) => [c.clientMessageId, c.attachmentId])).toEqual([[id, "upload-1"], [id, "upload-1"]]);
    });

    it("uploads again after a 404 on the send, because the server may have dropped the upload", async () => {
      const calls: (string | undefined)[] = [];
      let uploads = 0;
      const outbox = createOutbox({
        newId: () => "c1",
        upload: async () => ({ id: `upload-${++uploads}` }),
        send: async (id, body, _reply, attachmentId) => {
          calls.push(attachmentId);
          if (calls.length === 1) throw Object.assign(new Error("not found"), { status: 404 });
          return stored(id, body ?? "", 1);
        },
        onSent: () => {},
      });

      const id = outbox.submit("", undefined, photo);
      await outbox.settled();
      outbox.retry(id);
      await outbox.settled();

      expect(calls).toEqual(["upload-1", "upload-2"]);
    });

    it("keeps later Messages going while an image waits failed, and sends text without any upload", async () => {
      const { outbox, uploaded, confirmed } = setup(["ok"], ["fail"]);

      outbox.submit("pic", undefined, photo);
      outbox.submit("words");
      await outbox.settled();

      expect(uploaded).toHaveLength(1);
      expect(confirmed.map((m) => m.body)).toEqual(["words"]);
    });
  });
});
