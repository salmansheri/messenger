import type { ReactionView } from "@/lib/api";

/** The six reactions in the order the backend lists and offers them, each with the name a screen reader says. */
export const REACTIONS = [
  { emoji: "👍", name: "thumbs up" },
  { emoji: "❤️", name: "heart" },
  { emoji: "😂", name: "laughing" },
  { emoji: "😮", name: "surprised" },
  { emoji: "😢", name: "sad" },
  { emoji: "🙏", name: "folded hands" },
] as const;

const orderOf = (emoji: string | undefined) => {
  const at = REACTIONS.findIndex((reaction) => reaction.emoji === emoji);
  return at < 0 ? REACTIONS.length : at;
};

/** What to call a reaction aloud; an emoji this version does not know (a newer server) is still just "reaction". */
export function reactionName(emoji: string | undefined): string {
  return REACTIONS.find((reaction) => reaction.emoji === emoji)?.name ?? "reaction";
}

/** The name of a reaction's button under a Message: what pressing it does, and how many chose it. */
export function chipName(view: ReactionView): string {
  return `React with ${reactionName(view.emoji)} (${view.userIds?.length ?? 0})`;
}

/** The emoji this person chose for the Message, if any. */
export function myReaction(reactions: readonly ReactionView[] | undefined, myId: string | undefined): string | undefined {
  if (!myId) return undefined;
  return reactions?.find((view) => view.userIds?.includes(myId))?.emoji;
}

const without = (view: ReactionView, userId: string): ReactionView => ({ ...view, userIds: view.userIds?.filter((id) => id !== userId) });

/**
 * The reactions after `userId` chose `emoji` (or took theirs away with null): one reaction per person, so they leave
 * whatever group they were in, groups left empty go, and the groups stay in the offered order with people in the order
 * they chose. The very same list when nothing changes.
 */
export function applyReaction(
  reactions: readonly ReactionView[] | undefined,
  userId: string,
  emoji: string | null,
): ReactionView[] {
  const current = reactions ?? [];
  const had = current.find((view) => view.userIds?.includes(userId))?.emoji ?? null;
  if (had === emoji) return reactions as ReactionView[] | undefined ?? [];
  const others = current.map((view) => without(view, userId)).filter((view) => (view.userIds?.length ?? 0) > 0);
  if (emoji === null) return others;
  const group = others.find((view) => view.emoji === emoji);
  const next = group
    ? others.map((view) => (view === group ? { ...view, userIds: [...(view.userIds ?? []), userId] } : view))
    : [...others, { emoji, userIds: [userId] }];
  return next.sort((a, b) => orderOf(a.emoji) - orderOf(b.emoji));
}

/** The reactions with one person taken out of all of them (they left); the same list if they were in none. */
export function clearUser(reactions: readonly ReactionView[] | undefined, userId: string): ReactionView[] {
  const current = reactions ?? [];
  if (!current.some((view) => view.userIds?.includes(userId))) return reactions as ReactionView[] | undefined ?? [];
  return current.map((view) => without(view, userId)).filter((view) => (view.userIds?.length ?? 0) > 0);
}

/**
 * Events are best effort and can arrive late or twice, so each person's word about a Message is kept with its time and
 * an older or repeated one is refused. `times` is by "messageId:userId"; the same object comes back when refused.
 */
export function acceptReaction(
  times: Readonly<Record<string, string>>,
  event: { messageId: string; userId: string; at: string },
): { accepted: boolean; times: Readonly<Record<string, string>> } {
  const key = `${event.messageId}:${event.userId}`;
  const known = times[key];
  if (known && Date.parse(event.at) <= Date.parse(known)) return { accepted: false, times };
  return { accepted: true, times: { ...times, [key]: event.at } };
}
