import type { ConversationResponse } from "@/lib/api";

/**
 * What this device has received from other people: the latest Message of each Conversation, unless it is the person's
 * own (or there is none). Receiving the latest one covers everything before it.
 */
export function latestFromOthers(
  conversations: readonly ConversationResponse[],
  myId: string | undefined,
): { conversationId: string; seq: number }[] {
  if (!myId) return [];
  return conversations.flatMap(({ id, lastMessage }) =>
    id && lastMessage?.seq && lastMessage.senderId !== myId ? [{ conversationId: id, seq: lastMessage.seq }] : [],
  );
}
