"use client";

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ConversationResponse } from "@/lib/api";
import { shownError } from "@/features/auth/server-problems";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { ParticipantList } from "@/features/presence/participant-list";
import { AddAddressField } from "./add-address-field";
import { groupNameSchema } from "./schemas";
import { useGroupActions } from "./use-group-actions";

/**
 * A Group's information and management, under its header: the Participants (admins first, with who is online), and
 * for an Admin renaming, adding a person by email, promoting and removing; for every member, leaving. What a person
 * may do follows their role; if the server refuses anyway, the reason shows in place.
 */
export function GroupPanel({ conversation, myId }: { conversation: ConversationResponse; myId: string | undefined }) {
  const conversationId = conversation.id ?? "";
  const participants = conversation.participants ?? [];
  const isAdmin = participants.some((participant) => participant.userId === myId && participant.role === "ADMIN");
  const onlyAdmin = isAdmin && participants.filter((participant) => participant.role === "ADMIN").length === 1;
  const actions = useGroupActions(conversationId);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // Focus follows the confirmation: onto the safe choice when it opens, back to "Leave Group" when it is cancelled.
  const focusCancel = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const returnToLeave = useRef(false);
  const focusLeave = useCallback((element: HTMLElement | null) => {
    if (element && returnToLeave.current) {
      returnToLeave.current = false;
      element.focus();
    }
  }, []);

  // One change to a Participant at a time: while one is under way the others wait, whichever row they are on.
  const changing = actions.promote.isPending || actions.remove.isPending;
  const failure = actions.failure;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-muted underline-offset-4 hover:underline">
        Participants ({participants.length})
      </summary>
      <div className="mt-3 flex max-h-[50dvh] flex-col gap-5 overflow-y-auto pr-1 pb-2">
        {isAdmin && (
          // Keyed by the current name, so a rename by another Admin replaces what is typed here.
          <RenameForm
            key={conversation.name}
            current={conversation.name ?? ""}
            pending={actions.rename.isPending}
            refusal={failure?.about === "name" ? failure.message : undefined}
            onEdit={actions.clearFailure}
            onRename={(name) => actions.rename.mutate({ path: { conversationId }, body: { name } })}
          />
        )}

        <ParticipantList
          conversation={conversation}
          myId={myId}
          actions={
            isAdmin
              ? (participant) => {
                  const who = participant.displayName ?? "this person";
                  const userId = participant.userId ?? "";
                  return (
                    <>
                      {participant.role !== "ADMIN" && (
                        <Button
                          variant="quiet"
                          aria-label={`Make Admin (${who})`}
                          busy={changing}
                          onClick={() => actions.promote.mutate({ path: { conversationId, userId } })}
                        >
                          Make Admin
                        </Button>
                      )}
                      <Button
                        variant="quiet"
                        aria-label={`Remove ${who}`}
                        busy={changing}
                        onClick={() => actions.remove.mutate({ path: { conversationId, userId } })}
                      >
                        Remove
                      </Button>
                    </>
                  );
                }
              : undefined
          }
        />

        {isAdmin && (
          <AddAddressField
            pending={actions.add.isPending}
            error={failure?.about === "address" ? failure.message : undefined}
            onEdit={actions.clearFailure}
            onAdd={(email) =>
              actions.add.mutateAsync(email).then(
                () => true,
                () => false, // the failure is shown by the action itself
              )
            }
          />
        )}

        {failure && (failure.about === "panel" || failure.about === "form") && <Notice tone="problem">{failure.message}</Notice>}

        <div>
          {confirmingLeave ? (
            <div className="flex flex-col gap-2">
              <p>
                Leave this Group?
                {onlyAdmin && participants.length > 1 ? " You are its only Admin, so another member will become Admin." : ""}
              </p>
              <div className="flex gap-4">
                <Button busy={actions.leave.isPending} onClick={() => actions.leave.mutate({ path: { conversationId } })}>
                  Leave
                </Button>
                <Button
                  ref={focusCancel}
                  variant="quiet"
                  onClick={() => {
                    returnToLeave.current = true;
                    setConfirmingLeave(false);
                    actions.clearFailure();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button ref={focusLeave} variant="quiet" onClick={() => setConfirmingLeave(true)}>
              Leave Group
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

/** The Group's name, changeable by an Admin. A refusal of the name shows under it until it is edited. */
function RenameForm({
  current,
  pending,
  refusal,
  onEdit,
  onRename,
}: {
  current: string;
  pending: boolean;
  refusal: string | undefined;
  onEdit: () => void;
  onRename: (name: string) => void;
}) {
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const form = useForm({
    defaultValues: { name: current },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => {
      const name = groupNameSchema.parse(value.name);
      if (name !== current) onRename(name); // the same name is not a change worth asking the server about
    },
  });

  return (
    <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <form.Field name="name" validators={{ onDynamic: groupNameSchema }}>
          {(field) => (
            <Field
              label="Group name"
              autoComplete="off"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => {
                field.handleChange(event.target.value);
                onEdit();
              }}
              error={shownError(field.state.meta, refusal)}
            />
          )}
        </form.Field>
      </div>
      <Button type="submit" variant="quiet" busy={pending} className="mb-2.5">
        Rename
      </Button>
    </form>
  );
}
