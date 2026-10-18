"use client";

import { useQuery } from "@tanstack/react-query";
import { call, sdk } from "@/lib/api";

/** The signed-in User's own profile. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => call(sdk.me()) });
}
