"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toProblem, type ConversationResponse } from "@/lib/api";
import { conversationTitle, otherParticipantId } from "./present";
import { useBlock } from "./use-block";
import { blockedNotice, blockFailureMessage } from "./wording";

/**
 * In place of the composer while the person has blocked the other one in this Direct conversation: the server refuses
 * sending until they unblock, which they can do here. A refusal is said in the server's own words.
 */
export function BlockedNotice({
  conversation,
  myId,
  onUnblocked,
}: {
  conversation: ConversationResponse;
  myId: string | undefined;
  /** Called once the server has lifted the Block (the composer is about to come back). */
  onUnblocked: () => void;
}) {
  const other = otherParticipantId(conversation, myId);
  const { unblock } = useBlock(other);
  const [problem, setProblem] = useState<string>();
  return (
    <div className="border-t border-rule px-4 py-3 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{blockedNotice(conversationTitle(conversation, myId))}</p>
        <Button
          variant="quiet"
          busy={unblock.isPending}
          onClick={() => {
            if (!other) return;
            setProblem(undefined);
            unblock.mutate(
              { path: { userId: other } },
              { onSuccess: onUnblocked, onError: (error) => setProblem(blockFailureMessage(toProblem(error))) },
            );
          }}
        >
          Unblock
        </Button>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-accent">
          {problem}
        </p>
      )}
    </div>
  );
}
