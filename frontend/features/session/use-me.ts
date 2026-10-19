"use client";

import { useQuery } from "@tanstack/react-query";
import { meOptions } from "@/lib/api";

/** The signed-in User's own profile. */
export function useMe() {
  return useQuery(meOptions());
}
