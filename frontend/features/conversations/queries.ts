"use client";

import { useQuery } from "@tanstack/react-query";
import { call, sdk, type ConversationResponse } from "@/lib/api";
import { useMe } from "@/features/session/use-me";

export const conversationsKey = ["conversations"] as const;

/**
 * The signed-in person's Conversations, most recently active first, with their participants, latest Message and
 * unread count: one request for the whole list, however many Conversations there are.
 */
export function useConversations() {
  return useQuery({ queryKey: conversationsKey, queryFn: () => call(sdk.list()) });
}

/** The list together with who is looking at it (a Direct conversation is named after the other person). */
export type ConversationList =
  | { status: "pending" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "ready"; items: ConversationResponse[]; myId: string | undefined };

export function useConversationList(): ConversationList {
  const conversations = useConversations();
  const me = useMe();
  if (conversations.isError) return { status: "error", error: conversations.error, retry: () => void conversations.refetch() };
  if (me.isError) return { status: "error", error: me.error, retry: () => void me.refetch() };
  if (!conversations.data || !me.data) return { status: "pending" };
  return { status: "ready", items: conversations.data, myId: me.data.id };
}
