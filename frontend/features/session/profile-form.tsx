"use client";

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toProblem, updateMeMutation } from "@/lib/api";
import { displayNameSchema } from "@/features/auth/schemas";
import { shownError, useServerProblems } from "@/features/auth/server-problems";
import { recordProfile } from "@/features/realtime/sync";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { nameChangeFailureMessage } from "./wording";

const FIELDS = ["displayName"] as const;

/**
 * The name other people see. The same rules as at sign-up (checked here first, and by the server); saving the name that
 * is already there asks the server for nothing. Everyone who shares a Conversation with the person, and their other
 * sessions, hear about a change, and so does this screen's own copy of the list. The form is keyed by the name held,
 * so a change made in another session replaces what is in the box; the "saved" notice lives out here so it survives the
 * form being replaced by the save itself.
 */
export function ProfileForm({ userId, current }: { userId: string; current: string }) {
  const [saved, setSaved] = useState(false);
  return <NameForm key={current} userId={userId} current={current} saved={saved} onSaved={setSaved} />;
}

function NameForm({ userId, current, saved, onSaved }: { userId: string; current: string; saved: boolean; onSaved: (saved: boolean) => void }) {
  const queryClient = useQueryClient();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const problems = useServerProblems(FIELDS);

  const update = useMutation({
    ...updateMeMutation(),
    onMutate: () => {
      problems.clearAll();
      onSaved(false);
    },
    onSuccess: (profile) => {
      onSaved(true);
      recordProfile(queryClient, userId, { displayName: profile.displayName ?? current });
    },
    onError: (error) => problems.show(toProblem(error), nameChangeFailureMessage),
  });

  const form = useForm({
    defaultValues: { displayName: current },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => {
      const displayName = displayNameSchema.parse(value.displayName);
      if (displayName === current) return undefined; // nothing to change
      return update.mutateAsync({ body: { displayName } }).catch(() => undefined);
    },
  });

  return (
    <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="mt-3 flex flex-col gap-4">
      <form.Field name="displayName" validators={{ onDynamic: displayNameSchema }}>
        {(field) => (
          <Field
            label="Your name"
            autoComplete="name"
            hint="This is how other people see you, including on Messages you sent before."
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => {
              field.handleChange(event.target.value);
              problems.clearField("displayName");
              onSaved(false);
            }}
            error={shownError(field.state.meta, problems.fieldErrors.displayName)}
          />
        )}
      </form.Field>
      {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
      <div className="flex items-center gap-4">
        <Button type="submit" busy={update.isPending}>
          {update.isPending ? "Saving…" : "Save name"}
        </Button>
        <p role="status" className="text-sm text-ink-muted">
          {saved ? "Name saved." : ""}
        </p>
      </div>
    </form>
  );
}
