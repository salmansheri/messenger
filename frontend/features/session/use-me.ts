"use client";

import { useQuery } from "@tanstack/react-query";
import { call, sdk } from "@/lib/api";

export const meKey = ["me"] as const;

/** The signed-in User's own profile. */
export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: () => call(sdk.me()) });
}
