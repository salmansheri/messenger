"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DotsIcon, DropdownMenu, MenuItem, useCloseMenu } from "@/components/ui/dropdown-menu";
import { toProblem, type ConversationResponse, type UpdateSettingsRequest } from "@/lib/api";
import { conversationTitle, otherParticipantId } from "./present";
import { isMuted } from "./settings";
import { useBlock } from "./use-block";
import { useUpdateSettings } from "./use-update-settings";
import { BLOCK_EXPLANATION, blockFailureMessage, settingsFailureMessage } from "./wording";

/**
 * What the person can do with this Conversation for themselves: mute it (for 8 hours, a week or for ever), archive it,
 * pin it, and in a Direct conversation block or unblock the other person. They are private to the person and the same
 * on all of their devices. Blocking asks first, inside the menu, saying what it does. When the server refuses (a fourth
 * pin, too many Block changes) the menu stays open and says why in its own words.
 */
export function ConversationMenu({ conversation, myId }: { conversation: ConversationResponse; myId: string | undefined }) {
  const [problem, setProblem] = useState<string>();
  const [asking, setAsking] = useState(false);
  // Cancelling the question gives focus back to "Block" (the choices come back in place of the question).
  const returnToBlockRef = useRef(false);
  const forget = useCallback(() => {
    setProblem(undefined);
    setAsking(false);
  }, []);
  return (
    <DropdownMenu
      label="Options for this Conversation"
      icon={<DotsIcon />}
      onClose={forget}
      replacement={
        asking ? (
          <BlockQuestion
            conversation={conversation}
            myId={myId}
            onProblem={setProblem}
            onCancel={() => {
              returnToBlockRef.current = true;
              setProblem(undefined);
              setAsking(false);
            }}
          />
        ) : undefined
      }
      below={
        problem && (
          <p role="alert" className="px-3 py-2 text-sm text-accent">
            {problem}
          </p>
        )
      }
    >
      <Choices
        conversation={conversation}
        myId={myId}
        onProblem={setProblem}
        onAskBlock={() => {
          setProblem(undefined);
          setAsking(true);
        }}
        returnToBlockRef={returnToBlockRef}
      />
    </DropdownMenu>
  );
}

function Choices({
  conversation,
  myId,
  onProblem,
  onAskBlock,
  returnToBlockRef,
}: {
  conversation: ConversationResponse;
  myId: string | undefined;
  onProblem: (message: string | undefined) => void;
  onAskBlock: () => void;
  returnToBlockRef: React.RefObject<boolean>;
}) {
  const conversationId = conversation.id ?? "";
  const close = useCloseMenu();
  const update = useUpdateSettings();
  const other = otherParticipantId(conversation, myId);
  const { unblock, busy: blocking } = useBlock(other);
  const settings = conversation.settings;
  const muted = isMuted(settings, new Date());
  const focusBlock = useCallback(
    (element: HTMLButtonElement | null) => {
      if (element && returnToBlockRef.current) {
        returnToBlockRef.current = false;
        element.focus();
      }
    },
    [returnToBlockRef],
  );

  function choose(body: UpdateSettingsRequest) {
    onProblem(undefined);
    update.mutate(
      { path: { conversationId }, body },
      { onSuccess: () => close(true), onError: (error) => onProblem(settingsFailureMessage(toProblem(error))) },
    );
  }

  return (
    <>
      <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "EIGHT_HOURS" })}>
        Mute for 8 hours
      </MenuItem>
      <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "ONE_WEEK" })}>
        Mute for a week
      </MenuItem>
      <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "ALWAYS" })}>
        Mute always
      </MenuItem>
      {muted && (
        <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "NONE" })}>
          Unmute
        </MenuItem>
      )}
      <MenuItem busy={update.isPending} onSelect={() => choose({ archived: !settings?.archived })}>
        {settings?.archived ? "Unarchive" : "Archive"}
      </MenuItem>
      <MenuItem busy={update.isPending} onSelect={() => choose({ pinned: !settings?.pinned })}>
        {settings?.pinned ? "Unpin" : "Pin"}
      </MenuItem>
      {conversation.type === "DIRECT" && other && conversation.blocked && (
        <MenuItem
          busy={blocking}
          onSelect={() => {
            onProblem(undefined);
            unblock.mutate(
              { path: { userId: other } },
              { onSuccess: () => close(true), onError: (error) => onProblem(blockFailureMessage(toProblem(error))) },
            );
          }}
        >
          Unblock {conversationTitle(conversation, myId)}
        </MenuItem>
      )}
      {conversation.type === "DIRECT" && other && !conversation.blocked && (
        <MenuItem ref={focusBlock} busy={blocking} onSelect={onAskBlock}>
          Block {conversationTitle(conversation, myId)}
        </MenuItem>
      )}
    </>
  );
}

/**
 * Asked before blocking, in place of the menu's choices: what blocking does, then Block or Cancel. Focus goes to
 * Cancel, the safe choice, when the question appears.
 */
function BlockQuestion({
  conversation,
  myId,
  onProblem,
  onCancel,
}: {
  conversation: ConversationResponse;
  myId: string | undefined;
  onProblem: (message: string | undefined) => void;
  onCancel: () => void;
}) {
  const close = useCloseMenu();
  const other = otherParticipantId(conversation, myId);
  const { block } = useBlock(other);
  const name = conversationTitle(conversation, myId);
  const focusCancel = useCallback((element: HTMLButtonElement | null) => element?.focus(), []);
  return (
    <div role="group" aria-label={`Block ${name}?`} className="flex flex-col gap-2 p-2">
      <p className="font-medium">Block {name}?</p>
      <ul className="list-disc pl-5 text-sm text-ink-muted">
        {BLOCK_EXPLANATION.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex gap-4">
        <Button
          busy={block.isPending}
          onClick={() => {
            if (!other) return;
            onProblem(undefined);
            block.mutate(
              { path: { userId: other } },
              { onSuccess: () => close(true), onError: (error) => onProblem(blockFailureMessage(toProblem(error))) },
            );
          }}
        >
          Block
        </Button>
        <Button ref={focusCancel} variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
