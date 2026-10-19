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
import { shownError, useServerProblems } from "@/features/auth/server-problems";
import { PaneHeader } from "@/features/conversations/pane-header";
import { useMe } from "@/features/session/use-me";
import { addPerson, type Person } from "./members";
import { AddAddressField } from "./add-address-field";
import { checkGroupName, groupNameSchema } from "./schemas";
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

  // The people are kept in a ref as well as in state, so an add that finishes later reads the list as it is by then.
  const people = useRef<Person[]>([]);
  const [shown, setShown] = useState<Person[]>([]);
  const [addressError, setAddressError] = useState<string>();
  const [peopleError, setPeopleError] = useState<string>();
  const lookup = useMutation(lookupMutation());

  function setPeople(next: Person[]) {
    people.current = next;
    setShown(next);
  }

  /** Looks the address up and adds the person as a chip; says whether that worked. */
  async function addAddress(email: string): Promise<boolean> {
    setAddressError(undefined);
    try {
      const found = await lookup.mutateAsync({ body: { email } });
      if (!found.id) return false;
      const added = addPerson(people.current, { id: found.id, displayName: found.displayName ?? email, email }, me.data?.id);
      if (!added.ok) {
        setAddressError(added.message);
        return false;
      }
      setPeople(added.people);
      setPeopleError(undefined);
      return true;
    } catch (error) {
      setAddressError(groupFailure(toProblem(error), "add").message);
      return false;
    }
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
      if (people.current.length === 0) {
        setPeopleError("Add at least one person.");
        addressInput.current?.focus();
        return;
      }
      // The mutation reports its own failures (onError), so a rejection here has nothing more to say.
      return create.mutateAsync({ body: { name: name.name, userIds: people.current.map((person) => person.id) } }).catch(() => undefined);
    },
  });

  return (
    <>
      <PaneHeader>New Group</PaneHeader>
      <div className="w-full max-w-md px-4 py-8 sm:px-8">
        <p className="text-ink-muted">Give the Group a name, then add people by the exact email address they signed up with.</p>
        <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="mt-6 flex flex-col gap-5">
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
                  problems.clearField("name");
                }}
                error={shownError(field.state.meta, problems.fieldErrors.name)}
              />
            )}
          </form.Field>

          <div className="flex flex-col gap-3">
            <AddAddressField
              inputRef={addressInput}
              pending={lookup.isPending}
              error={addressError ?? peopleError}
              onEdit={() => setAddressError(undefined)}
              onAdd={addAddress}
            />

            {shown.length > 0 && (
              <ul aria-label="People in this Group" className="flex flex-wrap gap-2">
                {shown.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 rounded-sm border border-rule bg-surface px-2.5 py-1 text-sm">
                    <span>
                      <span className="font-serif font-semibold">{person.displayName}</span>{" "}
                      <span className="text-ink-muted">{person.email}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${person.displayName}`}
                      className="text-ink-muted hover:text-ink"
                      onClick={() => {
                        setPeople(people.current.filter((candidate) => candidate.id !== person.id));
                        addressInput.current?.focus(); // the button that was pressed is gone: keep the keyboard somewhere useful
                      }}
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
