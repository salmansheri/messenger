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
import { emailSchema } from "@/features/auth/schemas";
import { groupFailure, type GroupAction } from "./wording";

/** A refusal or failure, and where on the panel it belongs. */
export type PanelFailure = { message: string; about: "name" | "address" | "panel" };

/**
 * What a member or Admin can do to a Group, with the answer to each shown in place: `failure` says what went wrong and
 * where it belongs. A change is not applied to what is on screen by hand: the list is asked for again (and the server
 * announces it to everyone else), so every screen shows what the server now has.
 */
export function useGroupActions(conversationId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<PanelFailure>();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: listQueryKey() });
    void queryClient.invalidateQueries({ queryKey: presenceQueryKey({ path: { conversationId } }) });
  };
  const failed = (action: GroupAction) => (error: unknown) => {
    const found = groupFailure(toProblem(error), action);
    setFailure({ message: found.message, about: found.about === "form" ? "panel" : found.about });
  };
  const started = () => setFailure(undefined);

  const rename = useMutation({ ...renameMutation(), onMutate: started, onSuccess: refresh, onError: failed("rename") });
  const remove = useMutation({ ...removeParticipantMutation(), onMutate: started, onSuccess: refresh, onError: failed("remove") });
  const promote = useMutation({ ...promoteMutation(), onMutate: started, onSuccess: refresh, onError: failed("promote") });
  const add = useMutation({
    // The address is looked up first (there is no searching people), then that person is added.
    mutationFn: async (email: string) => {
      const { data: person } = await sdk.lookup({ body: { email: emailSchema.parse(email) } });
      if (!person.id) throw new Error("The lookup answer had no user id.");
      return (await sdk.addParticipant({ path: { conversationId }, body: { userId: person.id } })).data;
    },
    onMutate: started,
    onSuccess: refresh,
    onError: failed("add"),
  });
  const leave = useMutation({
    ...leaveMutation(),
    onMutate: started,
    onSuccess: () => {
      router.replace("/app");
      refresh();
    },
    onError: failed("leave"),
  });

  return { rename, remove, promote, add, leave, failure, clearFailure: started };
}
