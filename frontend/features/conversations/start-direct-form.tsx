"use client";

import { useRouter } from "next/navigation";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { listQueryKey, sdk } from "@/lib/api";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { emailSchema } from "@/features/auth/schemas";
import { shownError, useServerProblems } from "@/features/auth/server-problems";
import { useMe } from "@/features/session/use-me";
import { PaneHeader } from "./pane-header";
import { SelfConversationError, startDirectOutcome } from "./wording";

const FIELDS = ["email"] as const;

/** Starts a Direct conversation with someone, found by their exact email address (there is no searching people). */
export function StartDirectForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const problems = useServerProblems(FIELDS);

  const start = useMutation({
    mutationFn: async (email: string) => {
      const { data: person } = await sdk.lookup({ body: { email } });
      if (!person.id) throw new Error("The lookup answer had no user id.");
      if (person.id === me.data?.id) throw new SelfConversationError();
      return (await sdk.startDirect({ body: { userId: person.id } })).data;
    },
    onMutate: () => problems.clearAll(),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey() });
      router.push(`/app/c/${conversation.id}`);
    },
    onError: (error) => {
      const { message, about } = startDirectOutcome(error);
      if (about === "address") problems.showField("email", message);
      else problems.showForm(message);
    },
  });

  const form = useForm({
    defaultValues: { email: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => start.mutateAsync(emailSchema.parse(value.email)).catch(() => undefined),
  });

  return (
    <>
      <PaneHeader>Start a Conversation</PaneHeader>
      <div className="w-full max-w-md px-4 py-8 sm:px-8">
        <p className="text-ink-muted">
          Type the email address of someone who has an account. Only an exact address finds a person.
        </p>
        <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="mt-6 flex flex-col gap-5">
          <form.Field name="email" validators={{ onDynamic: emailSchema }}>
            {(field) => (
              <Field
                label="Their email address"
                type="email"
                autoComplete="off"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  problems.clearField("email");
                }}
                error={shownError(field.state.meta, problems.fieldErrors.email)}
              />
            )}
          </form.Field>
          {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
          <div>
            <Button type="submit" busy={start.isPending}>
              {start.isPending ? "Starting…" : "Start Conversation"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
