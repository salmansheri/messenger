"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { trayOptions, trayQueryKey } from "@/lib/api";
import { useMe } from "@/features/session/use-me";
import { orderTray, type TrayEntry } from "./tray";

/** The Stories tray as it is shown (see `orderTray`); empty until it has loaded, and when nobody has a Story. */
export function useStoryTray(): TrayEntry[] {
  const tray = useQuery(trayOptions());
  const me = useMe();
  return useMemo(() => orderTray(tray.data, me.data), [tray.data, me.data]);
}

/**
 * Fresh photo links: they are signed per response and last 15 minutes, so a Story left open can stop loading. A
 * request already under way is reused, so photos that run out together cost one request.
 */
export function useTrayRefresh(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: trayQueryKey() }, { cancelRefetch: false }), [queryClient]);
}
