"use client";

import { useQuery } from "@tanstack/react-query";
import { call, sdk } from "@/lib/api";

export const conversationsKey = ["conversations"] as const;

/**
 * The signed-in person's Conversations, most recently active first, with their participants, latest Message and
 * unread count: one request for the whole list, however many Conversations there are.
 */
export function useConversations() {
  return useQuery({ queryKey: conversationsKey, queryFn: () => call(sdk.list()) });
}
