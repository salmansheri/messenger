"use client";

import { useQuery } from "@tanstack/react-query";
import type { Frontier } from "./status";

export type { Frontier } from "./status";

/** How far everyone else has got in a Conversation. Only ever set by events (there is no request for it). */
export const receiptsKey = (conversationId: string) => ["receipts", conversationId] as const;

/** The highest read position of this person that reports have told us about (to ignore a report that arrives late). */
export const readPositionKey = (conversationId: string) => ["read-position", conversationId] as const;

/** The Conversation's frontier as events have reported it so far (nothing until the first one). */
export function useFrontier(conversationId: string): Frontier | undefined {
  return useQuery<Frontier | null>({
    queryKey: receiptsKey(conversationId),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  }).data ?? undefined;
}
