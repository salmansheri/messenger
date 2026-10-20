"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { toProblem } from "@/lib/api";
import { formatClock } from "@/features/conversations/present";
import { statusFor, type Frontier } from "@/features/receipts/status";
import { checkMessageBody } from "./schema";
import type { TimelineItem } from "./timeline";
import { useDeleteForEveryone, useEditMessage, useHideMessage } from "./use-message-actions";
import { changeFailureMessage, sendFailureMessage } from "./wording";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;

type Props = {
  item: MessageItem;
  conversationId: string;
  names: Map<string | undefined, string | undefined>;
  frontier: Frontier | undefined;
  onRetry: (clientMessageId: string) => void;
};

/** One Message in the history: when, who, its text (or the placeholder of a deleted one), how far it has got, and what can be done to it. */
export function MessageRow({ item, conversationId, names, frontier, onRetry }: Props) {
  const { mine, pending } = item;
  const sender = mine ? "You" : (names.get(item.senderId) ?? "Someone who left");
  const [editing, setEditing] = useState(false);
  // After editing ends, focus goes back to where the person started it: this Message's actions.
  const summary = useRef<HTMLElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) summary.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <li
      data-seq={!mine && item.seq !== undefined ? item.seq : undefined}
      className={`grid grid-cols-[3rem_1fr] gap-x-3 px-4 sm:grid-cols-[3.5rem_1fr] sm:px-8 ${item.startsRun ? "pt-3" : "pt-0.5"}`}
    >
      <div className="flex flex-col items-start gap-0.5 pt-1">
        <time dateTime={item.createdAt} className="font-mono text-xs text-ink-muted">
          {formatClock(item.createdAt)}
        </time>
        {item.edited && <span className="font-mono text-xs text-ink-muted">edited</span>}
        {mine && !pending && item.seq !== undefined && <ReceiptMark status={statusFor({ seq: item.seq, status: item.status }, frontier)} />}
      </div>
      <div className={`min-w-0 border-l-2 pl-3 ${mine ? "border-accent" : "border-rule"}`}>
        {item.startsRun && <p className="font-serif text-sm font-semibold">{sender}</p>}
        {editing && item.messageId && !item.deleted ? (
          <MessageEditor
            conversationId={conversationId}
            messageId={item.messageId}
            initial={item.body}
            onClose={() => setEditing(false)}
          />
        ) : item.deleted ? (
          <p className="text-ink-muted italic">This Message was deleted.</p>
        ) : (
          <p className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{item.body}</p>
        )}
        {pending?.status === "sending" && <p className="text-xs text-ink-muted">Sending…</p>}
        {pending?.status === "failed" && (
          <p className="flex flex-wrap items-center gap-x-3 text-sm">
            <span className="text-accent">
              Not sent. {pending.error ? sendFailureMessage(toProblem(pending.error)) : ""}
            </span>
            <Button variant="quiet" onClick={() => onRetry(pending.clientMessageId)}>
              Retry
            </Button>
          </p>
        )}
        {item.messageId && !pending && !editing && (
          <MessageActions
            conversationId={conversationId}
            messageId={item.messageId}
            own={mine && !item.deleted}
            whose={mine ? "your" : `${sender}'s`}
            when={formatClock(item.createdAt)}
            summaryRef={summary}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * What can be done to a confirmed Message, behind one "Actions" control so a long history has one tab stop per
 * Message. The sender can edit it or delete it for everyone (the server says when the time has passed, and the
 * reason is shown as it gives it); anyone can delete it for themselves. Deleting for everyone asks first.
 */
function MessageActions({
  conversationId,
  messageId,
  own,
  whose,
  when,
  summaryRef,
  onEdit,
}: {
  conversationId: string;
  messageId: string;
  own: boolean;
  whose: string;
  when: string;
  summaryRef: React.RefObject<HTMLElement | null>;
  onEdit: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const remove = useDeleteForEveryone();
  const hide = useHideMessage();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string>();
  // Focus follows the question: onto the safe choice when it opens, back to "Delete for everyone" when it is cancelled.
  const focusCancel = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const returnToAsk = useRef(false);
  const focusAsk = useCallback((element: HTMLElement | null) => {
    if (element && returnToAsk.current) {
      returnToAsk.current = false;
      element.focus();
    }
  }, []);

  const fail = (error: unknown) => setProblem(changeFailureMessage(toProblem(error)));
  const finish = () => {
    if (details.current) details.current.open = false;
    summaryRef.current?.focus();
  };
  // A hidden Message leaves the history, so focus moves to a neighbour before its row goes (not to the page body).
  const finishHidden = () => {
    const row = details.current?.closest("li");
    const neighbour = [row?.nextElementSibling, row?.previousElementSibling]
      .map((sibling) => sibling?.querySelector<HTMLElement>("summary"))
      .find(Boolean);
    (neighbour ?? row?.closest<HTMLElement>('[role="region"]'))?.focus();
  };
  const working = remove.isPending || hide.isPending;

  return (
    <details
      ref={details}
      className="mt-0.5 text-sm"
      onToggle={() => {
        setAsking(false);
        setProblem(undefined);
      }}
    >
      <summary
        ref={summaryRef}
        className="inline-block cursor-pointer rounded-sm px-1 py-1 text-xs text-ink-muted underline decoration-rule underline-offset-4 hover:decoration-ink"
      >
        Actions<span className="sr-only"> for {whose} Message at {when}</span>
      </summary>
      <div className="mt-1 flex flex-col gap-2">
        {asking ? (
          <div className="flex flex-col gap-2">
            <p>Delete this Message for everyone?</p>
            <div className="flex gap-4">
              <Button
                busy={remove.isPending}
                onClick={() => {
                  setProblem(undefined);
                  remove.mutate({ path: { conversationId, messageId } }, { onSuccess: finish, onError: fail });
                }}
              >
                Delete
              </Button>
              <Button
                ref={focusCancel}
                variant="quiet"
                onClick={() => {
                  returnToAsk.current = true;
                  setAsking(false);
                  setProblem(undefined);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {own && (
              <Button
                variant="quiet"
                onClick={() => {
                  if (details.current) details.current.open = false;
                  onEdit();
                }}
              >
                Edit
              </Button>
            )}
            {own && (
              <Button ref={focusAsk} variant="quiet" onClick={() => setAsking(true)}>
                Delete for everyone
              </Button>
            )}
            <Button
              variant="quiet"
              busy={hide.isPending}
              onClick={() => {
                setProblem(undefined);
                hide.mutate({ path: { conversationId, messageId } }, { onSuccess: finishHidden, onError: fail });
              }}
            >
              Delete for me
            </Button>
          </div>
        )}
        {problem && !working && (
          <p role="alert" className="text-sm text-accent">
            {problem}
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * The text of a Message, edited where it stands. Enter saves, Shift+Enter starts a new line and Escape puts everything
 * back; the same rules as sending apply, and saving the text unchanged asks the server for nothing.
 */
function MessageEditor({
  conversationId,
  messageId,
  initial,
  onClose,
}: {
  conversationId: string;
  messageId: string;
  initial: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [problem, setProblem] = useState<string>();
  const edit = useEditMessage();
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  function save() {
    if (edit.isPending) return;
    const checked = checkMessageBody(text);
    if (!checked.ok) {
      setProblem(checked.message);
      return;
    }
    if (checked.body === initial) {
      onClose();
      return;
    }
    setProblem(undefined);
    edit.mutate(
      { path: { conversationId, messageId }, body: { body: checked.body } },
      { onSuccess: onClose, onError: (error) => setProblem(changeFailureMessage(toProblem(error))) },
    );
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  }

  const errorId = `edit-error-${messageId}`;
  return (
    <div className="flex flex-col gap-2 py-1">
      <textarea
        ref={field}
        aria-label="Edit text"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? errorId : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(undefined);
        }}
        onKeyDown={keyDown}
        rows={2}
        className={`field-sizing-content max-h-40 min-h-11 w-full resize-none rounded-sm border bg-surface px-3 py-2 text-base text-ink ${
          problem ? "border-accent" : "border-rule"
        }`}
      />
      {problem && (
        <p id={errorId} role="alert" className="text-sm text-accent">
          {problem}
        </p>
      )}
      <div className="flex gap-4">
        <Button busy={edit.isPending} onClick={save}>
          Save
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const STATUS_WORDS = { SENT: "Sent", DELIVERED: "Delivered", READ: "Read" } as const;

/** How far a Message of the person's own has got, as dots: one for sent, two for delivered, two in the accent for read. */
function ReceiptMark({ status }: { status: keyof typeof STATUS_WORDS }) {
  return (
    <span
      role="img"
      aria-label={STATUS_WORDS[status]}
      title={STATUS_WORDS[status]}
      className={`font-mono text-xs leading-none tracking-tighter ${status === "READ" ? "text-accent" : "text-ink-muted"}`}
    >
      {status === "SENT" ? "•" : "••"}
    </span>
  );
}
