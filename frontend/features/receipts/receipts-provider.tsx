"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { call, sdk, type ConversationResponse } from "@/lib/api";
import { conversationsKey, useConversations } from "@/features/conversations/queries";
import { applyToList } from "@/features/realtime/apply-event";
import { useMe } from "@/features/session/use-me";
import { createReceiptReporter, type ReceiptReporter } from "./reporter";

const ReporterContext = createContext<ReceiptReporter | null>(null);

/**
 * Tells the server what this device has received, for the signed-in area. A Message counts as delivered as soon as it
 * shows up in the Conversation list (loaded, or pushed live): the latest Message from someone else in each
 * Conversation. Reading is reported by the Message view (`useReceiptReporter`), when Messages are actually seen.
 */
export function ReceiptsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [reporter] = useState(() =>
    createReceiptReporter({
      send: (conversationId, body) => call(sdk.report({ path: { conversationId }, body })),
      onResult(conversationId, result) {
        if (result.unreadCount === undefined) return;
        const event = {
          type: "unread.updated",
          conversationId,
          deliveredSeq: result.deliveredSeq ?? 0,
          readSeq: result.readSeq ?? 0,
          unreadCount: result.unreadCount,
        } as const;
        queryClient.setQueryData<ConversationResponse[]>(conversationsKey, (list) => list && applyToList(list, event, undefined).list);
      },
    }),
  );

  const conversations = useConversations().data;
  const myId = useMe().data?.id;
  useEffect(() => {
    if (!conversations || !myId) return;
    for (const conversation of conversations) {
      const latest = conversation.lastMessage;
      if (conversation.id && latest?.seq && latest.senderId !== myId) reporter.delivered(conversation.id, latest.seq);
    }
  }, [conversations, myId, reporter]);

  return <ReporterContext value={reporter}>{children}</ReporterContext>;
}

/** Where the Message view reports what has been read. */
export function useReceiptReporter(): ReceiptReporter {
  const reporter = useContext(ReporterContext);
  if (!reporter) throw new Error("useReceiptReporter needs the ReceiptsProvider.");
  return reporter;
}
