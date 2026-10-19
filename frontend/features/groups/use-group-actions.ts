"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  leaveMutation,
  listQueryKey,
  presenceQueryKey,
  promoteMutation,
  removeParticipantMutation,
  renameMutation,
  sdk,
  toProblem,
} from "@/lib/api";
import { groupFailure, type GroupAction, type GroupFailure } from "./wording";

/**
 * What a member or Admin can do to a Group, with the answer to each shown in place: `failure` says what went wrong and
 * where it belongs. A change is not applied to what is on screen by hand: the list is asked for again (and the server
 * announces it to everyone else), so every screen shows what the server now has.
 */
export function useGroupActions(conversationId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<GroupFailure>();

  const clearFailure = () => setFailure(undefined);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: listQueryKey() });
    void queryClient.invalidateQueries({ queryKey: presenceQueryKey({ path: { conversationId } }) });
  };
  /** What every action does around its request: forget the last failure, refresh on success, explain a failure. */
  const around = (action: GroupAction) => ({
    onMutate: clearFailure,
    onSuccess: refresh,
    onError: (error: unknown) => setFailure(groupFailure(toProblem(error), action)),
  });

  const rename = useMutation({ ...renameMutation(), ...around("rename") });
  const remove = useMutation({ ...removeParticipantMutation(), ...around("remove") });
  const promote = useMutation({ ...promoteMutation(), ...around("promote") });
  const add = useMutation({
    // The address is looked up first (there is no searching people), then that person is added: one action to the person.
    mutationFn: async (email: string) => {
      const { data: person } = await sdk.lookup({ body: { email } });
      if (!person.id) throw new Error("The lookup answer had no user id.");
      return (await sdk.addParticipant({ path: { conversationId }, body: { userId: person.id } })).data;
    },
    ...around("add"),
  });
  const leave = useMutation({
    ...leaveMutation(),
    ...around("leave"),
    onSuccess: () => {
      router.replace("/app");
      refresh();
    },
  });

  return { rename, remove, promote, add, leave, failure, clearFailure };
}
