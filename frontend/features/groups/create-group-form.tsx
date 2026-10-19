"use client";

import { useRouter } from "next/navigation";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { createMutation, listQueryKey, lookupMutation, toProblem } from "@/lib/api";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { emailSchema } from "@/features/auth/schemas";
import { shownError, useServerProblems } from "@/features/auth/server-problems";
import { PaneHeader } from "@/features/conversations/pane-header";
import { useMe } from "@/features/session/use-me";
import { addPerson, type Person } from "./members";
import { checkGroupName } from "./schemas";
import { groupFailure } from "./wording";

const FIELDS = ["name"] as const;

/**
 * Creating a Group: a name, and people added by their exact email address (there is no searching people). Each address
 * is looked up when it is added, and shown as a named chip so the person can see who they are adding before confirming.
 */
export function CreateGroupForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const problems = useServerProblems(FIELDS);
  const addressInput = useRef<HTMLInputElement>(null);

  const [people, setPeople] = useState<Person[]>([]);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string>();
  const [peopleError, setPeopleError] = useState<string>();

  const lookup = useMutation({
    ...lookupMutation(),
    onSuccess: (found, { body }) => {
      if (!found.id) return;
      const added = addPerson(people, { id: found.id, displayName: found.displayName ?? body.email, email: body.email }, me.data?.id);
      if (!added.ok) {
        setAddressError(added.message);
        return;
      }
      setPeople(added.people);
      setPeopleError(undefined);
      // Clear the box only if it still holds the address just added: the person may already be typing the next one.
      setAddress((current) => (current.trim().toLowerCase() === body.email ? "" : current));
      addressInput.current?.focus();
    },
    onError: (error) => setAddressError(groupFailure(toProblem(error), "add").message),
  });

  function addAddress() {
    const parsed = emailSchema.safeParse(address);
    if (!parsed.success) {
      setAddressError(parsed.error.issues[0].message);
      return;
    }
    setAddressError(undefined);
    lookup.mutate({ body: { email: parsed.data } });
  }

  const create = useMutation({
    ...createMutation(),
    onMutate: () => problems.clearAll(),
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey() });
      router.push(`/app/c/${group.id}`);
    },
    onError: (error) => {
      const failure = groupFailure(toProblem(error), "create");
      if (failure.about === "name") problems.showField("name", failure.message);
      else if (failure.about === "address") setAddressError(failure.message);
      else problems.showForm(failure.message);
    },
  });

  const form = useForm({
    defaultValues: { name: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => {
      const name = checkGroupName(value.name);
      if (!name.ok) return;
      if (people.length === 0) {
        setPeopleError("Add at least one person.");
        addressInput.current?.focus();
        return;
      }
      return create.mutateAsync({ body: { name: name.name, userIds: people.map((person) => person.id) } }).catch(() => undefined);
    },
  });

  return (
    <>
      <PaneHeader>New Group</PaneHeader>
      <div className="w-full max-w-md px-4 py-8 sm:px-8">
        <p className="text-ink-muted">Give the Group a name, then add people by the exact email address they signed up with.</p>
        <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="mt-6 flex flex-col gap-5">
          <form.Field
            name="name"
            validators={{ onDynamic: ({ value }) => { const checked = checkGroupName(value); return checked.ok ? undefined : checked.message; } }}
          >
            {(field) => (
              <Field
                label="Group name"
                autoComplete="off"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  problems.clearField("name");
                }}
                error={shownError(field.state.meta, problems.fieldErrors.name)}
              />
            )}
          </form.Field>

          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field
                  ref={addressInput}
                  label="Add a person by email"
                  type="email"
                  autoComplete="off"
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setAddressError(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault(); // Enter adds the person; it must not create the Group
                      addAddress();
                    }
                  }}
                  error={addressError ?? peopleError}
                />
              </div>
              <Button type="button" variant="quiet" busy={lookup.isPending} onClick={addAddress} className="mb-2.5">
                {lookup.isPending ? "Adding…" : "Add"}
              </Button>
            </div>

            {people.length > 0 && (
              <ul aria-label="People in this Group" className="flex flex-wrap gap-2">
                {people.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 rounded-sm border border-rule bg-surface px-2.5 py-1 text-sm">
                    <span>
                      <span className="font-serif font-semibold">{person.displayName}</span>{" "}
                      <span className="text-ink-muted">{person.email}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${person.displayName}`}
                      className="text-ink-muted hover:text-ink"
                      onClick={() => setPeople((current) => current.filter((candidate) => candidate.id !== person.id))}
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
          <div>
            <Button type="submit" busy={create.isPending}>
              {create.isPending ? "Creating…" : "Create Group"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
