import type { ConversationResponse, ConversationSettings } from "@/lib/api";

/**
 * Whether the settings mean a Conversation is muted at `now`. The server says when the list was fetched; a mute that
 * has an end can run out after that, with no event to say so, so the end is checked here.
 */
export function isMuted(settings: ConversationSettings | undefined, now: Date): boolean {
  if (!settings?.muted) return false;
  return !settings.mutedUntil || Date.parse(settings.mutedUntil) > now.getTime();
}

/** When the Conversation was last active, as a number; one with no time counts as the oldest, so the order is always the same. */
const activityOf = (conversation: ConversationResponse) => {
  const at = conversation.updatedAt ? Date.parse(conversation.updatedAt) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
};

/**
 * The Conversations as the list shows them: pinned ones first, then the most recently active, as the server orders
 * them. Where nothing tells two apart the order given is kept. The list given is not changed.
 */
export function orderConversations(list: readonly ConversationResponse[]): ConversationResponse[] {
  return [...list].sort((a, b) => {
    const pinned = Number(Boolean(b.settings?.pinned)) - Number(Boolean(a.settings?.pinned));
    if (pinned !== 0) return pinned;
    return activityOf(b) - activityOf(a);
  });
}

const same = (a: ConversationSettings | undefined, b: ConversationSettings) =>
  Boolean(a?.muted) === Boolean(b.muted) &&
  (a?.mutedUntil ?? undefined) === (b.mutedUntil ?? undefined) &&
  Boolean(a?.archived) === Boolean(b.archived) &&
  Boolean(a?.pinned) === Boolean(b.pinned);

/**
 * The list with one Conversation's settings replaced and the list put in order again (a newly pinned one moves up, an
 * unpinned one goes back by its activity). The very same list when the settings are the same already, and nothing when
 * the Conversation is not in it.
 */
export function withSettings(
  list: ConversationResponse[],
  conversationId: string,
  settings: ConversationSettings,
): ConversationResponse[] | undefined {
  const known = list.find((conversation) => conversation.id === conversationId);
  if (!known) return undefined;
  if (same(known.settings, settings)) return list;
  return orderConversations(list.map((conversation) => (conversation === known ? { ...known, settings } : conversation)));
}

/** Whether an archived Conversation has unread Messages: the reason to show a dot on the way to the Archived view. */
export function archivedHasUnread(list: readonly ConversationResponse[]): boolean {
  return list.some((conversation) => conversation.settings?.archived && (conversation.unreadCount ?? 0) > 0);
}
