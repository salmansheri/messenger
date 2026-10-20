"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reactMutation, unreactMutation } from "@/lib/api";
import { setReactionsInHistory } from "./queries";

/**
 * Putting a reaction on a Message, or taking the person's own away. Nothing is shown before the server has said yes;
 * then the reactions it answered with go into the loaded history (the event for the same change, which also arrives,
 * finds it done and is ignored if it is older).
 */
export function useReact() {
  const queryClient = useQueryClient();
  return useMutation({ ...reactMutation(), onSuccess: (message) => setReactionsInHistory(queryClient, message) });
}

export function useUnreact() {
  const queryClient = useQueryClient();
  return useMutation({ ...unreactMutation(), onSuccess: (message) => setReactionsInHistory(queryClient, message) });
}

