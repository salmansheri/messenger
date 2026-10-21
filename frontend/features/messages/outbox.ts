import type { MessageResponse, ReplyQuote } from "@/lib/api";

/** An image chosen to go with a Message: kept here until the server has it, so a retry can upload it again if needed. */
export type PendingImage = {
  file: File;
  /** An address for showing the image from this device while it is being sent (released once the Message is sent). */
  previewUrl: string;
  width?: number;
  height?: number;
  /** Set once the upload succeeded, so a retry sends the Message without uploading the image a second time. */
  attachmentId?: string;
};

/** A Message the person has written that the server has not confirmed yet. */
export type Pending = {
  /** Chosen here and reused by every retry, so the server can recognise a repeat and never store a second copy. */
  clientMessageId: string;
  body: string;
  status: "sending" | "failed";
  createdAt: string;
  /** The Message this one answers; every retry sends the same one. */
  replyTo?: ReplyQuote;
  /** The image sent with it; `body` is then its caption and may be empty. */
  image?: PendingImage;
  /** Why the last attempt failed, and whether it was the upload of the image or the sending of the Message. */
  error?: unknown;
  failedAt?: "upload" | "send";
};

type Options = {
  /** Stores the image ahead of the Message and says what to call it when sending. */
  upload: (file: File) => Promise<{ id: string }>;
  send: (
    clientMessageId: string,
    body: string | undefined,
    replyToMessageId: string | undefined,
    attachmentId: string | undefined,
  ) => Promise<MessageResponse>;
  /** Called with a preview address that is no longer needed (the Message was sent). */
  release?: (previewUrl: string) => void;
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
  upload,
  send,
  release,
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
    // The image goes first, once: what the server answered is remembered, so a retry only repeats what failed.
    let attachmentId = entry.image?.attachmentId;
    if (entry.image && !attachmentId) {
      try {
        attachmentId = (await upload(entry.image.file)).id;
      } catch (error) {
        update(clientMessageId, (current) => ({ ...current, status: "failed", error, failedAt: "upload" }));
        return;
      }
      const uploaded = attachmentId;
      update(clientMessageId, (current) => ({ ...current, image: current.image && { ...current.image, attachmentId: uploaded } }));
    }
    let message: MessageResponse;
    try {
      message = await send(clientMessageId, entry.body || undefined, entry.replyTo?.messageId, attachmentId);
    } catch (error) {
      // A 404 with an image may mean the server no longer has the upload (it keeps unsent ones for a day), so the
      // next attempt uploads it again rather than asking for the same missing one for ever.
      const lost = entry.image && (error as { status?: number } | null)?.status === 404;
      update(clientMessageId, (current) => ({
        ...current,
        status: "failed",
        error,
        failedAt: "send",
        image: current.image && lost ? { ...current.image, attachmentId: undefined } : current.image,
      }));
      return;
    }
    // The stored Message is handed on before the pending one goes, so there is never a moment with neither on screen.
    onSent(message);
    update(clientMessageId, () => undefined);
    if (entry.image) release?.(entry.image.previewUrl);
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
    /**
     * Shows the Message as sending and queues it, answering `replyTo` if given and carrying `image` (the body is then its
     * caption, possibly empty); returns its client Message ID.
     */
    submit(body: string, replyTo?: ReplyQuote, image?: Omit<PendingImage, "attachmentId">): string {
      const clientMessageId = newId();
      set([
        ...entries,
        {
          clientMessageId,
          body,
          status: "sending",
          createdAt: now(),
          ...(replyTo ? { replyTo } : {}),
          ...(image ? { image } : {}),
        },
      ]);
      enqueue(clientMessageId);
      return clientMessageId;
    },
    /** Sends a failed Message again with the same client Message ID. Anything else is ignored (a double press sends once). */
    retry(clientMessageId: string) {
      const entry = entries.find((candidate) => candidate.clientMessageId === clientMessageId);
      if (entry?.status !== "failed") return;
      update(clientMessageId, (entry) => ({ ...entry, status: "sending", error: undefined, failedAt: undefined }));
      enqueue(clientMessageId);
    },
    /** Resolves once everything queued so far has been answered. */
    settled: () => tail,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
