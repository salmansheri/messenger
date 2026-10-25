"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { blocksQueryKey, listQueryKey, meQueryKey, trayQueryKey } from "@/lib/api";

/**
 * Fresh Avatar links: they are signed per response and last 15 minutes, so a picture on a screen left open can stop
 * loading. The Conversation list (every Participant's picture), the person's own profile, the Blocked Users list and
 * the Stories tray are asked for again; a request already under way is reused rather than restarted, so the many
 * pictures that run out together cost one request each, not one per picture.
 */
export function useProfileRefresh(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listQueryKey() }, { cancelRefetch: false }),
      queryClient.invalidateQueries({ queryKey: meQueryKey() }, { cancelRefetch: false }),
      queryClient.invalidateQueries({ queryKey: blocksQueryKey() }, { cancelRefetch: false }),
      queryClient.invalidateQueries({ queryKey: trayQueryKey() }, { cancelRefetch: false }),
    ]);
  }, [queryClient]);
}
