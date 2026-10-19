"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { forgotPasswordMutation, resetPasswordMutation, toProblem } from "@/lib/api";
import { session } from "@/lib/auth/app-session";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { AuthCard } from "./auth-card";
import { resetEmail } from "./remembered-email";
import { PasswordChangedView } from "./password-changed-view";
import {
  emailSchema,
  resetPasswordSchema,
  type ResetPasswordValues,
} from "./schemas";
import { shownError, useServerProblems } from "./server-problems";
import { useWrongTries } from "./use-wrong-tries";
import { codesMessageFor } from "./wording";

const FIELDS = ["email", "code", "newPassword"] as const;
const defaultValues: ResetPasswordValues = { email: "", code: "", newPassword: "" };

/** Chooses a new password with the emailed code. Works cold too: the address is typed if it was not carried over. */
export function ResetPasswordForm() {
  const queryClient = useQueryClient();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const codeInput = useRef<HTMLInputElement>(null);
  const problems = useServerProblems(FIELDS);
  const [changed, setChanged] = useState(false);
  const wrongTries = useWrongTries();
  // Whether a code was just asked for on the previous screen. Only the browser knows (sessionStorage), hence this hook.
  const askedForCode = useSyncExternalStore(
    () => () => {},
    () => resetEmail.read() !== "",
    () => false,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useMutation({
    ...resetPasswordMutation(),
    onMutate: () => {
      setNotice(null);
      problems.clearAll();
    },
    onSuccess: () => {
      resetEmail.forget();
      // The backend ended every session of this person, this tab's included: make that true here too, now, instead of
      // at the next renewal, so the link to sign-in below really leads to a sign-in page.
      session.end();
      queryClient.clear();
      setChanged(true);
    },
    onError: (error, { body }) => {
      const problem = toProblem(error);
      if (problem.status !== 400) {
        problems.show(problem);
        return;
      }
      problems.showForm(wrongTries.refused(body.email, problem));
    },
  });

  const resend = useMutation({
    ...forgotPasswordMutation(),
    onMutate: () => {
      setNotice(null);
      problems.clearAll();
    },
    onSuccess: () => {
      wrongTries.reset();
      form.resetField("code");
      // Same words whether or not the address has an account: the answer must not tell.
      setNotice("If that address has an account, a new code is on its way. The old one no longer works.");
    },
    onError: (error) => problems.show(toProblem(error), codesMessageFor),
  });

  const busy = reset.isPending || resend.isPending;

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => reset.mutateAsync({ body: resetPasswordSchema.parse(value) }).catch(() => undefined),
  });

  // Coming from the previous screen, the address is already known and the code is what is missing.
  useEffect(() => {
    const email = resetEmail.read();
    if (email) {
      form.setFieldValue("email", email);
      codeInput.current?.focus();
    }
  }, [form]);

  function sendNewCode() {
    const address = emailSchema.safeParse(form.state.values.email);
    if (!address.success) {
      setNotice(null);
      problems.clearAll();
      problems.showField("email", address.error.issues[0].message);
      return;
    }
    resend.mutate({ body: { email: address.data } });
  }

  if (changed) return <PasswordChangedView />;

  return (
    <AuthCard
      heading="Choose a new password"
      intro={
        askedForCode
          ? "If that address has an account, we have emailed a 6-digit code. It stays valid for a few minutes."
          : "Enter the 6-digit code from your email, with the address it was sent to, and choose a new password."
      }
      footer={
        <>
          Remembered it? <Link href="/sign-in" className="underline underline-offset-4">Sign in</Link>
        </>
      }
    >
      <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="flex flex-col gap-5">
        <form.Field name="email" validators={{ onDynamic: resetPasswordSchema.shape.email }}>
          {(field) => (
            <Field
              label="Email address"
              type="email"
              autoComplete="email"
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
        <form.Field name="code" validators={{ onDynamic: resetPasswordSchema.shape.code }}>
          {(field) => (
            <Field
              ref={codeInput}
              label="Code from the email"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="font-mono tracking-[0.3em]"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => {
                field.handleChange(event.target.value);
                problems.clearField("code");
              }}
              error={shownError(field.state.meta, problems.fieldErrors.code)}
            />
          )}
        </form.Field>
        <form.Field name="newPassword" validators={{ onDynamic: resetPasswordSchema.shape.newPassword }}>
          {(field) => (
            <Field
              label="New password"
              type="password"
              revealable
              autoComplete="new-password"
              hint="8 to 72 characters."
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => {
                field.handleChange(event.target.value);
                problems.clearField("newPassword");
              }}
              error={shownError(field.state.meta, problems.fieldErrors.newPassword)}
            />
          )}
        </form.Field>
        {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
        {notice && <Notice tone="info">{notice}</Notice>}
        <div className="flex items-center justify-between gap-4">
          <Button type="submit" busy={busy}>
            {reset.isPending ? "Changing…" : "Change password"}
          </Button>
          <Button variant="quiet" onClick={sendNewCode} busy={busy}>
            {resend.isPending ? "Sending…" : "Send a new code"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
