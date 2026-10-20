"use client";

import { useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { checkMessageBody } from "./schema";

/**
 * Where a Message is written. Enter sends, Shift+Enter starts a new line. A Message that breaks a rule is not sent;
 * the reason shows under the box until the text is edited.
 */
export function Composer({
  onSend,
  onTyping,
  reply,
  onCancelReply,
  textareaRef,
}: {
  onSend: (body: string) => void;
  /** The box now has something in it (`true`) or is empty. Called on every change. */
  onTyping?: (hasText: boolean) => void;
  /** The Message being answered, shown above the box with a way to give up the reply. */
  reply?: { sender: string; text: string };
  onCancelReply?: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();

  function send() {
    const checked = checkMessageBody(text);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    onSend(checked.body);
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

  return (
    <form onSubmit={submit} className="border-t border-rule px-4 py-3 sm:px-8" noValidate>
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
      <div className="flex items-end gap-3">
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
          placeholder="Write a Message"
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
