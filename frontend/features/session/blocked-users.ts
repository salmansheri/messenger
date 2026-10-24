import type { BlockedUser } from "@/lib/api";

/** The Blocked Users list without that person (an Unblock, from here or anywhere else); the same list when they are not in it. */
export function withoutBlockedUser(list: BlockedUser[] | undefined, userId: string): BlockedUser[] | undefined {
  if (!list?.some((blocked) => blocked.userId === userId)) return list;
  return list.filter((blocked) => blocked.userId !== userId);
}

/**
 * Where focus goes once a row is unblocked and has left the list: the next person still listed, or the nearest one
 * before it. `previous` is the list as it was shown with that row, `current` as it is now (others may have left too, by
 * a second Unblock or one in another tab). Nothing when the list is now empty (the caller then uses the empty state).
 */
export function focusAfterRemoval(previous: string[], current: string[], removedId: string): string | undefined {
  const listed = new Set(current);
  const index = previous.indexOf(removedId);
  const after = previous.slice(index + 1).find((id) => listed.has(id));
  return after ?? previous.slice(0, Math.max(index, 0)).reverse().find((id) => listed.has(id)) ?? current[0];
}
