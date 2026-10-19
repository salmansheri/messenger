"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkMessageBody } from "./schema";

/**
 * Where a Message is written. Enter sends, Shift+Enter starts a new line. A Message that breaks a rule is not sent;
 * the reason shows under the box until the text is edited.
 */
export function Composer({ onSend }: { onSend: (body: string) => void }) {
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
    setError(undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while composing text with an input method confirms the text, it does not send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-rule px-4 py-3 sm:px-8" noValidate>
      <div className="flex items-end gap-3">
        <textarea
          aria-label="Message"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "composer-error" : undefined}
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
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
