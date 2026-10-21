"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPT, chooseImage } from "./image-file";
import { checkMessageBody } from "./schema";

/** An image the person has chosen and not sent yet. */
export type ChosenImage = { file: File; previewUrl: string; width?: number; height?: number };

/**
 * Where a Message is written. Enter sends, Shift+Enter starts a new line. A Message that breaks a rule is not sent;
 * the reason shows under the box until the text is edited. An image can be attached with the button, pasted into the
 * box or dropped on the form; it shows above the box with a way to take it off, and the text becomes its caption (which
 * may be empty).
 */
export function Composer({
  onSend,
  onTyping,
  reply,
  onCancelReply,
  textareaRef,
}: {
  onSend: (body: string, image?: ChosenImage) => void;
  /** The box now has something in it (`true`) or is empty. Called on every change. */
  onTyping?: (hasText: boolean) => void;
  /** The Message being answered, shown above the box with a way to give up the reply. */
  reply?: { sender: string; text: string };
  onCancelReply?: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [image, setImage] = useState<ChosenImage>();
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const attach = useRef<HTMLButtonElement>(null);
  // The preview address of an image that is chosen but never sent has to be given back; one that is sent is given
  // back by the outbox once the Message is stored.
  const unsent = useRef<string>(undefined);
  useEffect(() => () => {
    if (unsent.current) URL.revokeObjectURL(unsent.current);
  }, []);

  function discard() {
    if (unsent.current) URL.revokeObjectURL(unsent.current);
    unsent.current = undefined;
    setImage(undefined);
  }

  /** Takes the chosen image off; the button that did it goes away, so focus moves to the one that brings it back. */
  function removeImage() {
    discard();
    setError(undefined);
    attach.current?.focus();
  }

  function choose(files: ArrayLike<File> | null | undefined): boolean {
    const chosen = chooseImage(files);
    if (chosen.kind === "none") return false;
    if (chosen.kind === "refused") {
      setError(chosen.message);
      return true;
    }
    discard();
    const previewUrl = URL.createObjectURL(chosen.file);
    unsent.current = previewUrl;
    setImage({ file: chosen.file, previewUrl });
    setError(undefined);
    // The size is read from the picture itself, so the row can keep its room while the thumbnail loads.
    const probe = new Image();
    probe.onload = () =>
      setImage((current) => (current?.previewUrl === previewUrl ? { ...current, width: probe.naturalWidth, height: probe.naturalHeight } : current));
    probe.src = previewUrl;
    return true;
  }

  function send() {
    // With an image the text is only a caption: empty is fine, but what is there must still be a valid text.
    if (image && text.trim().length === 0) {
      onSend("", image);
      unsent.current = undefined; // the outbox owns the preview from here
      setImage(undefined);
      setText("");
      onTyping?.(false);
      setError(undefined);
      return;
    }
    const checked = checkMessageBody(text);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    onSend(checked.body, image);
    if (image) {
      unsent.current = undefined;
      setImage(undefined);
    }
    setText("");
    onTyping?.(false);
    setError(undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Escape while composing text with an input method cancels the composition, not the reply.
    if (event.key === "Escape" && reply && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onCancelReply?.();
      return;
    }
    // Enter while composing text with an input method confirms the text, it does not send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    // Only when files were pasted and no text came with them (a copy from a spreadsheet carries both, and the text is
    // what the person meant); pasting text goes on as usual.
    if (event.clipboardData.getData("text/plain")) return;
    if (choose(event.clipboardData.files)) event.preventDefault();
  }

  function dragOver(event: DragEvent) {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  }

  function drop(event: DragEvent) {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={dragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`border-t px-4 py-3 sm:px-8 ${dragging ? "border-accent bg-band" : "border-rule"}`}
      noValidate
    >
      {reply && (
        <div role="status" className="mb-2 flex items-start gap-3 border-l-2 border-accent bg-band px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-xs font-semibold">Replying to {reply.sender}</p>
            <p className="line-clamp-2 break-words text-ink-muted [overflow-wrap:anywhere]">{reply.text}</p>
          </div>
          <Button variant="quiet" onClick={onCancelReply}>
            Cancel reply
          </Button>
        </div>
      )}
      {image && (
        <div role="status" className="mb-2 flex items-center gap-3 border-l-2 border-accent bg-band px-3 py-2 text-sm">
          {/* The picture is described by the words beside it, so it adds nothing for a screen reader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.previewUrl} alt="" className="size-14 shrink-0 rounded-sm border border-rule object-cover" />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-xs font-semibold">Image to send</p>
            <p className="truncate text-ink-muted">{image.file.name || "Pasted image"}</p>
          </div>
          <Button variant="quiet" onClick={removeImage}>
            Remove image
          </Button>
        </div>
      )}
      <div className="flex items-end gap-3">
        <input
          ref={picker}
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => {
            choose(event.target.files);
            event.target.value = ""; // the same file can be chosen again after it was removed
          }}
        />
        <Button ref={attach} variant="quiet" onClick={() => picker.current?.click()} className="min-h-11">
          Attach image
        </Button>
        <textarea
          ref={textareaRef}
          aria-label="Message"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "composer-error" : undefined}
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
            onTyping?.(event.target.value.length > 0);
          }}
          onKeyDown={keyDown}
          onPaste={paste}
          placeholder={image ? "Add a caption (optional)" : "Write a Message"}
          className={`field-sizing-content max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-sm border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted ${
            error ? "border-accent" : "border-rule"
          }`}
        />
        <Button type="submit">Send</Button>
      </div>
      {error && (
        <p id="composer-error" role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      )}
    </form>
  );
}
