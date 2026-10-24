/** What can be done to a confirmed Message from its menu and picker. */
export type MessageActions = {
  reply: boolean;
  react: boolean;
  edit: boolean;
  deleteForEveryone: boolean;
  deleteForMe: boolean;
};

/**
 * What a Message offers, from whose it is, whether it was deleted for everyone and whether the person has blocked the
 * other one in this Direct conversation. A deleted Message only offers Delete for me. While blocked the server refuses
 * replying, reacting and editing, so they are not offered; deleting their own Messages for everyone and hiding any
 * for themselves still work.
 */
export function messageActions({ mine, deleted, blocked }: { mine: boolean; deleted: boolean; blocked: boolean }): MessageActions {
  const open = !deleted && !blocked;
  return {
    reply: open,
    react: open,
    edit: open && mine,
    deleteForEveryone: mine && !deleted,
    deleteForMe: true,
  };
}
