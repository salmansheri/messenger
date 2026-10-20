"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteForEveryoneMutation, editMutation, hideMutation, listQueryKey } from "@/lib/api";
import { markDeletedInHistory, removeFromHistory, updateMessageInHistory } from "./queries";

/**
 * What a person can do to a Message in the Conversation they have open. Nothing is shown before the server has said
 * yes; then the loaded history is changed at once (the event for the same change, which also arrives, finds it done),
 * and the list is asked for again because its latest line may be this Message.
 */
function useRefreshList() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: listQueryKey() });
}

/** Changes the text of the person's own Message. The server decides whether there is still time. */
export function useEditMessage() {
  const queryClient = useQueryClient();
  const refreshList = useRefreshList();
  return useMutation({
    ...editMutation(),
    onSuccess: (message) => {
      updateMessageInHistory(queryClient, message);
      refreshList();
    },
  });
}

/** Deletes the person's own Message for everyone, leaving a placeholder in its place. */
export function useDeleteForEveryone() {
  const queryClient = useQueryClient();
  const refreshList = useRefreshList();
  return useMutation({
    ...deleteForEveryoneMutation(),
    onSuccess: (_nothing, variables) => {
      markDeletedInHistory(queryClient, variables.path.conversationId, variables.path.messageId);
      refreshList();
    },
  });
}

/** Hides a Message from the person's own view only. */
export function useHideMessage() {
  const queryClient = useQueryClient();
  const refreshList = useRefreshList();
  return useMutation({
    ...hideMutation(),
    onSuccess: (_nothing, variables) => {
      removeFromHistory(queryClient, variables.path.conversationId, variables.path.messageId);
      refreshList();
    },
  });
}
