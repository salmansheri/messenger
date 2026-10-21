import type { ConversationResponse, SearchResult } from "@/lib/api";
import { conversationTitle } from "@/features/conversations/present";

/** Results that follow each other from one Conversation, under its name (`key` is unique even when it comes back). */
export type ResultGroup = { key: string; conversationId: string | undefined; title: string; results: SearchResult[] };

/**
 * Search results across all Conversations, still newest first, with each run from the same Conversation under that
 * Conversation's name (the other person, or the Group's name, as in the list). A Conversation that is not in the
 * loaded list (it may have just been joined) is called 'Conversation' rather than its results being dropped.
 */
export function groupResults(results: readonly SearchResult[], conversations: readonly ConversationResponse[], myId: string | undefined): ResultGroup[] {
  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const groups: ResultGroup[] = [];
  for (const result of results) {
    const last = groups.at(-1);
    if (last && last.conversationId === result.conversationId) {
      last.results.push(result);
      continue;
    }
    const conversation = byId.get(result.conversationId);
    groups.push({
      key: `${result.conversationId}:${result.messageId}`,
      conversationId: result.conversationId,
      title: conversation ? conversationTitle(conversation, myId) : "Conversation",
      results: [result],
    });
  }
  return groups;
}
