"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ConversationResponse } from "@/lib/api";
import { emailSchema } from "@/features/auth/schemas";
import { ParticipantList } from "@/features/presence/participant-list";
import { checkGroupName } from "./schemas";
import { useGroupActions, type PanelFailure } from "./use-group-actions";

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

  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string>();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const addressProblem = addressError ?? (actions.failure?.about === "address" ? actions.failure.message : undefined);

  function add(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(address);
    if (!parsed.success) return setAddressError(parsed.error.issues[0].message);
    setAddressError(undefined);
    actions.add.mutate(parsed.data, { onSuccess: () => setAddress("") });
  }

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
            refused={actions.failure}
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
                          aria-label={`Promote ${who}`}
                          busy={actions.promote.isPending}
                          onClick={() => actions.promote.mutate({ path: { conversationId, userId } })}
                        >
                          Make Admin
                        </Button>
                      )}
                      <Button
                        variant="quiet"
                        aria-label={`Remove ${who}`}
                        busy={actions.remove.isPending}
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
          <form onSubmit={add} noValidate className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field
                label="Add a person by email"
                type="email"
                autoComplete="off"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setAddressError(undefined);
                  actions.clearFailure();
                }}
                error={addressProblem}
              />
            </div>
            <Button type="submit" variant="quiet" busy={actions.add.isPending} className="mb-2.5">
              {actions.add.isPending ? "Adding…" : "Add"}
            </Button>
          </form>
        )}

        {actions.failure?.about === "panel" && <Notice tone="problem">{actions.failure.message}</Notice>}

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
                <Button variant="quiet" onClick={() => setConfirmingLeave(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmingLeave(true)}>
              Leave Group
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

/** The Group's name, changeable by an Admin. A refusal of the name shows under it. */
function RenameForm({
  current,
  pending,
  refused,
  onRename,
}: {
  current: string;
  pending: boolean;
  refused: PanelFailure | undefined;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkGroupName(name);
    if (!checked.ok) return setError(checked.message);
    setError(undefined);
    onRename(checked.name);
  }

  return (
    <form onSubmit={submit} noValidate className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <Field
          label="Group name"
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
          error={error ?? (refused?.about === "name" ? refused.message : undefined)}
        />
      </div>
      <Button type="submit" variant="quiet" busy={pending} className="mb-2.5">
        Rename
      </Button>
    </form>
  );
}
