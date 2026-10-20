"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSettingsMutation } from "@/lib/api";
import { recordSettings } from "@/features/realtime/sync";

/**
 * Changes the person's own mute, archive or pin for a Conversation. Nothing is shown before the server has said yes;
 * then the answer is put into the loaded list the same way as the event for the same change (which also arrives, and
 * finds it done).
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    ...updateSettingsMutation(),
    onSuccess: (conversation) => {
      if (conversation.id && conversation.settings) recordSettings(queryClient, conversation.id, conversation.settings);
    },
  });
}
