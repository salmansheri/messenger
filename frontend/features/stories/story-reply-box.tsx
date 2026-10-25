"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { listQueryKey, sdk, toProblem } from "@/lib/api";
import { directWith } from "@/features/conversations/present";
import { useConversations } from "@/features/conversations/queries";
import { addMessageToHistory } from "@/features/messages/queries";
import { checkMessageBody } from "@/features/messages/schema";
import { useMe } from "@/features/session/use-me";
import { replyPlaceholder, storyReplyFailureMessage } from "./wording";

/** How long "Sent" stays after a reply went. */
const SENT_MS = 2000;

/**
 * The "Reply to Grace…" box at the bottom of someone else's Story. A reply is an ordinary Message in your Direct
 * conversation with the poster, quoting the Story; the viewer stays open and says "Sent" for a moment. Nothing is shown
 * without that Direct conversation, or while it is blocked. The Story waits while the box has focus.
 */
export function StoryReplyBox({
  storyId,
  posterId,
  posterName,
  onCover,
}: {
  storyId: string;
  posterId: string;
  posterName: string | undefined;
  onCover: (covered: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const me = useMe();
  const list = useConversations();
  const conversation = directWith(list.data ?? [], posterId, me.data?.id);
  const conversationId = conversation?.id;

  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [focused, setFocused] = useState(false);
  // One id per reply, kept while it is retried, so a send that did arrive is not stored twice.
  const clientMessageId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!focused) return;
    onCover(true);
    return () => onCover(false);
  }, [focused, onCover]);

  // A reply that failed and is sent again on another Story is another Message (the server refuses the old id for it).
  useEffect(() => {
    clientMessageId.current = undefined;
  }, [storyId]);

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), SENT_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      clientMessageId.current ??= crypto.randomUUID();
      const path = { conversationId: conversationId ?? "" };
      return (await sdk.send({ path, body: { clientMessageId: clientMessageId.current, body, replyToStoryId: storyId } })).data;
    },
    onSuccess: (message) => {
      clientMessageId.current = undefined;
      addMessageToHistory(queryClient, message);
      void queryClient.invalidateQueries({ queryKey: listQueryKey() });
      setText("");
      setSent(true);
    },
    onError: (failure) => setError(storyReplyFailureMessage(toProblem(failure))),
  });

  if (!conversationId || conversation.blocked) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkMessageBody(text);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(undefined);
    send.mutate(checked.body);
  }

  return (
    <form
      onSubmit={submit}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 bg-gradient-to-t from-scrim/80 to-transparent p-3 pt-10"
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={posterName ? `Reply to ${posterName}'s Story` : "Reply to this Story"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "story-reply-error" : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
            setSent(false);
            clientMessageId.current = undefined; // other words are another Message
          }}
          placeholder={replyPlaceholder(posterName)}
          className={`min-h-11 min-w-0 flex-1 rounded-full border bg-scrim/60 px-4 text-base text-on-scrim placeholder:text-on-scrim/60 ${
            error ? "border-on-scrim" : "border-on-scrim/30"
          }`}
        />
        <Button type="submit" busy={send.isPending}>
          Send
        </Button>
      </div>
      <p role="status" className="min-h-5 px-2 text-sm text-on-scrim">
        {sent ? "Sent" : ""}
      </p>
      {error && (
        <p id="story-reply-error" role="alert" className="px-2 text-sm text-on-scrim">
          {error}
        </p>
      )}
    </form>
  );
}
