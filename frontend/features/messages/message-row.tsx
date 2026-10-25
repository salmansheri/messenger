"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { toProblem, type MessageResponse } from "@/lib/api";
import { formatClock } from "@/features/conversations/present";
import { statusFor, type Frontier } from "@/features/receipts/status";
import { Avatar } from "@/features/people/person-avatar";
import { nextMenuIndex } from "@/components/ui/menu-keys";
import { checkMessageBody } from "./schema";
import type { TimelineItem } from "./timeline";
import { QuoteBlock, StoryQuoteBlock } from "./quote-block";
import { quoteView, storyQuoteView } from "./quote";
import { messageActions, type MessageActions } from "./actions";
import { ReactionChips, ReactMenu } from "./reaction-controls";
import { useDeleteForEveryone, useEditMessage, useHideMessage } from "./use-message-actions";
import { changeFailureMessage, imageLabel, sendFailureMessage, uploadFailureMessage } from "./wording";
import { MessageImage } from "./message-image";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;

type Props = {
  item: MessageItem;
  conversationId: string;
  /** Who is looking, and whether this is a Group (where it matters who reacted). */
  myId: string | undefined;
  group: boolean;
  /** The person has blocked the other one in this Direct conversation: only what the server still allows is offered. */
  blocked: boolean;
  names: Map<string | undefined, string | undefined>;
  /** Each Participant's Avatar link, shown beside the name at the start of a run. */
  avatars: Map<string | undefined, string | undefined>;
  frontier: Frontier | undefined;
  onRetry: (clientMessageId: string) => void;
  /** A loaded Message by its id: a quote takes its text from it, so an edit or deletion shows through. */
  loaded: (messageId: string | undefined) => MessageResponse | undefined;
  onReply: (messageId: string) => void;
  onJump: (messageId: string) => void;
  /** Fetches fresh image links when one has run out. */
  onImageExpired?: () => Promise<void>;
  /** Marked for a moment: the Message a search result opened the Conversation at. */
  highlighted?: boolean;
};

/** One Message in the history: when, who, its text (or the placeholder of a deleted one), how far it has got, and what can be done to it. */
export function MessageRow({ item, conversationId, myId, group, blocked, names, avatars, frontier, onRetry, loaded, onReply, onJump, onImageExpired, highlighted = false }: Props) {
  const { mine, pending } = item;
  const actions = messageActions({ mine, deleted: Boolean(item.deleted), blocked });
  const sender = mine ? "You" : (names.get(item.senderId) ?? "Someone who left");
  const senderId = mine ? myId : item.senderId;
  const [editing, setEditing] = useState(false);
  // An edit already open when a Block arrives closes: the server would refuse to save it.
  const editingNow = editing && actions.edit;
  // After editing ends, focus goes back to where the person started it: this Message's menu button.
  const trigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editingNow) trigger.current?.focus();
    wasEditing.current = editingNow;
  }, [editingNow]);

  return (
    <li
      data-seq={!mine && item.seq !== undefined ? item.seq : undefined}
      data-message-id={item.messageId}
      data-message-seq={item.seq}
      data-highlighted={highlighted || undefined}
      tabIndex={item.messageId ? -1 : undefined}
      className={`grid grid-cols-[3rem_1fr] gap-x-3 px-4 transition-colors duration-1000 sm:grid-cols-[3.5rem_1fr] sm:px-8 ${item.startsRun ? "pt-3" : "pt-0.5"} ${highlighted ? "bg-band" : ""}`}
    >
      <div className="flex flex-col items-start gap-0.5 pt-1">
        <time dateTime={item.createdAt} className="font-mono text-xs text-ink-muted">
          {formatClock(item.createdAt)}
        </time>
        {item.edited && <span className="font-mono text-xs text-ink-muted">edited</span>}
        {mine && !pending && item.seq !== undefined && <ReceiptMark status={statusFor({ seq: item.seq, status: item.status }, frontier)} />}
      </div>
      <div className={`relative min-w-0 border-l-2 pr-20 pl-3 ${mine ? "border-accent" : "border-rule"}`}>
        {item.startsRun && (
          <p className="flex items-center gap-1.5 font-serif text-sm font-semibold">
            <Avatar id={senderId} name={names.get(senderId)} url={avatars.get(senderId)} size="xs" />
            {sender}
          </p>
        )}
        {item.replyTo && !item.deleted && (
          <QuoteBlock
            view={quoteView(item.replyTo, loaded, (id) => (id === myId ? "You" : (names.get(id) ?? "Someone who left")))}
            onJump={item.replyTo.messageId && loaded(item.replyTo.messageId) ? () => onJump(item.replyTo?.messageId ?? "") : undefined}
          />
        )}
        {item.storyQuote && <StoryQuoteBlock view={storyQuoteView(item.storyQuote, mine)} />}
        {item.image && !item.deleted && (
          <MessageImage
            image={item.image}
            label={imageLabel(sender, formatClock(item.createdAt), item.body)}
            caption={item.body}
            refresh={pending ? undefined : onImageExpired}
          />
        )}
        {editingNow && item.messageId ? (
          <MessageEditor
            conversationId={conversationId}
            messageId={item.messageId}
            initial={item.body}
            onClose={() => setEditing(false)}
          />
        ) : item.deleted ? (
          <p className="text-ink-muted italic">This Message was deleted.</p>
        ) : (
          item.body && <p className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{item.body}</p>
        )}
        {item.messageId && !pending && !item.deleted && (
          <ReactionChips
            target={{ conversationId, messageId: item.messageId }}
            reactions={item.reactions}
            myId={myId}
            group={group}
            nameOf={(userId) => names.get(userId) ?? "Someone who left"}
          />
        )}
        {pending?.status === "sending" && <p className="text-xs text-ink-muted">Sending…</p>}
        {pending?.status === "failed" && (
          <p className="flex flex-wrap items-center gap-x-3 text-sm">
            <span className="text-accent">
              Not sent.{" "}
              {pending.error
                ? pending.failedAt === "upload"
                  ? uploadFailureMessage(toProblem(pending.error))
                  : sendFailureMessage(toProblem(pending.error), Boolean(pending.replyTo), Boolean(pending.image))
                : ""}
            </span>
            <Button variant="quiet" onClick={() => onRetry(pending.clientMessageId)}>
              Retry
            </Button>
          </p>
        )}
        {item.messageId && !pending && !editingNow && (
          <div className="absolute top-0 right-0 flex">
            {actions.react && (
              <ReactMenu
                target={{ conversationId, messageId: item.messageId }}
                whose={mine ? "your" : `${sender}'s`}
                when={formatClock(item.createdAt)}
                reactions={item.reactions}
                myId={myId}
              />
            )}
            <MessageMenu
              conversationId={conversationId}
              messageId={item.messageId}
              actions={actions}
              whose={mine ? "your" : `${sender}'s`}
              when={formatClock(item.createdAt)}
              triggerRef={trigger}
              onEdit={() => setEditing(true)}
              onReply={() => onReply(item.messageId ?? "")}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * What can be done to a confirmed Message, behind a three-dot button that opens a menu (a long history has one tab stop
 * per Message). The sender can edit it or delete it for everyone (the server says when the time has passed, and the
 * reason is shown as it gives it); anyone can delete it for themselves. Deleting for everyone asks first. Arrow keys
 * move through the items, Escape closes the menu and gives focus back to the button, and so does a click elsewhere.
 */
function MessageMenu({
  conversationId,
  messageId,
  actions,
  whose,
  when,
  triggerRef,
  onEdit,
  onReply,
}: {
  conversationId: string;
  messageId: string;
  /** What this Message offers (`messageActions`): a deleted one, or one in a blocked Direct conversation, offers less. */
  actions: MessageActions;
  whose: string;
  when: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onReply: () => void;
}) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const remove = useDeleteForEveryone();
  const hide = useHideMessage();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [upward, setUpward] = useState(false);

  const items = () => [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const close = useCallback(
    (giveFocusBack: boolean) => {
      setOpen(false);
      setAsking(false);
      setProblem(undefined);
      if (giveFocusBack) triggerRef.current?.focus();
    },
    [triggerRef],
  );

  // A click or touch anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, close]);

  // Opens upward when there is no room below inside the scrolling history (the last Messages), and puts focus on the first item.
  useLayoutEffect(() => {
    if (!open || !panel.current || !triggerRef.current) return;
    const history = triggerRef.current.closest<HTMLElement>('[role="region"]')?.getBoundingClientRect();
    const room = (history?.bottom ?? window.innerHeight) - triggerRef.current.getBoundingClientRect().bottom;
    setUpward(room < panel.current.offsetHeight + 8);
  }, [open, asking, triggerRef]);
  // Only when it opens: closing the question must not pull focus away from where it was sent back to.
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  // Focus follows the question: onto the safe choice when it opens, back to "Delete for everyone" when it is cancelled.
  const focusCancel = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const returnToAsk = useRef(false);
  const focusAsk = useCallback((element: HTMLElement | null) => {
    if (element && returnToAsk.current) {
      returnToAsk.current = false;
      element.focus();
    }
  }, []);

  // A hidden Message leaves the history, so focus moves to a neighbour before its row goes (not to the page body).
  const focusNeighbour = () => {
    const row = root.current?.closest("li");
    const neighbour = [row?.nextElementSibling, row?.previousElementSibling]
      .map((sibling) => sibling?.querySelector<HTMLElement>("button[aria-haspopup]"))
      .find(Boolean);
    (neighbour ?? row?.closest<HTMLElement>('[role="region"]'))?.focus();
  };

  const fail = (error: unknown) => setProblem(changeFailureMessage(toProblem(error)));
  const working = remove.isPending || hide.isPending;

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (asking) return;
    const list = items();
    const next = nextMenuIndex(list.length, list.indexOf(document.activeElement as HTMLElement), event.key);
    if (next !== undefined) {
      event.preventDefault();
      list[next]?.focus();
    }
  }

  return (
    <div ref={root} className="relative" onKeyDown={keyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Options for ${whose} Message at ${when}`}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="flex size-9 items-center justify-center rounded-sm text-ink-muted hover:text-ink"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          ref={panel}
          className={`absolute right-0 z-10 w-56 rounded-sm border border-rule bg-paper p-1 shadow-sm ${upward ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {asking ? (
            <div className="flex flex-col gap-2 p-2">
              <p>Delete this Message for everyone?</p>
              <div className="flex gap-4">
                <Button
                  busy={remove.isPending}
                  onClick={() => {
                    setProblem(undefined);
                    remove.mutate({ path: { conversationId, messageId } }, { onSuccess: () => close(true), onError: fail });
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
            <div role="menu" aria-label={`Options for ${whose} Message at ${when}`} className="flex flex-col">
              {actions.reply && (
                <MenuItem
                  onSelect={() => {
                    close(false);
                    onReply();
                  }}
                >
                  Reply
                </MenuItem>
              )}
              {actions.edit && (
                <MenuItem
                  onSelect={() => {
                    close(false);
                    onEdit();
                  }}
                >
                  Edit
                </MenuItem>
              )}
              {actions.deleteForEveryone && (
                <MenuItem ref={focusAsk} onSelect={() => setAsking(true)}>
                  Delete for everyone
                </MenuItem>
              )}
              {actions.deleteForMe && (
                <MenuItem
                  busy={hide.isPending}
                  onSelect={() => {
                    setProblem(undefined);
                    hide.mutate(
                      { path: { conversationId, messageId } },
                      {
                        onSuccess: () => {
                          focusNeighbour();
                          close(false);
                        },
                        onError: fail,
                      },
                    );
                  }}
                >
                  Delete for me
                </MenuItem>
              )}
            </div>
          )}
          {problem && !working && (
            <p role="alert" className="px-3 py-2 text-sm text-accent">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
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
