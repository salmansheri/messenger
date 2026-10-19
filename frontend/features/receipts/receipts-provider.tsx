"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { call, sdk } from "@/lib/api";
import { useConversations } from "@/features/conversations/queries";
import { recordUnread } from "@/features/realtime/sync";
import { useMe } from "@/features/session/use-me";
import { latestFromOthers } from "./delivered";
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
        if (result.readSeq !== undefined && result.unreadCount !== undefined) {
          recordUnread(queryClient, { conversationId, readSeq: result.readSeq, unreadCount: result.unreadCount });
        }
      },
    }),
  );

  const conversations = useConversations().data;
  const myId = useMe().data?.id;
  useEffect(() => {
    if (!conversations) return;
    for (const { conversationId, seq } of latestFromOthers(conversations, myId)) reporter.delivered(conversationId, seq);
  }, [conversations, myId, reporter]);

  return <ReporterContext value={reporter}>{children}</ReporterContext>;
}

/** Where the Message view reports what has been read. */
export function useReceiptReporter(): ReceiptReporter {
  const reporter = useContext(ReporterContext);
  if (!reporter) throw new Error("useReceiptReporter needs the ReceiptsProvider.");
  return reporter;
}
