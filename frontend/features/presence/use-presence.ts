"use client";

import { useQuery } from "@tanstack/react-query";
import { presenceOptions } from "@/lib/api";

/** The start of every Conversation's presence key, for finding the ones that are loaded. */
export const allPresenceKey = [{ _id: "presence" }];

/** Whether the other Participants of a Conversation are online, or when they were last seen. */
export function usePresence(conversationId: string) {
  return useQuery(presenceOptions({ path: { conversationId } }));
}
