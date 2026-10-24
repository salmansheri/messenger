"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { blockMutation, unblockMutation } from "@/lib/api";
import { recordBlock } from "@/features/realtime/sync";

/**
 * Blocks or unblocks the other person of a Direct conversation. Nothing is shown before the server has said yes; then
 * the change is put into the loaded list the same way as the `block.changed` event (which the person's other tabs and
 * devices get, and this one finds done), and what the server now shows differently is asked for again.
 */
export function useBlock(userId: string | undefined) {
  const queryClient = useQueryClient();
  const block = useMutation({ ...blockMutation(), onSuccess: () => userId && recordBlock(queryClient, userId, true) });
  const unblock = useMutation({ ...unblockMutation(), onSuccess: () => userId && recordBlock(queryClient, userId, false) });
  return { block, unblock, busy: block.isPending || unblock.isPending };
}
