"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { resendVerificationMutation, toProblem, verifyEmailMutation } from "@/lib/api";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { AuthCard } from "./auth-card";
import { verificationEmail } from "./remembered-email";
import { codeSchema, emailSchema, verifySchema, type VerifyValues } from "./schemas";
import { shownError, useServerProblems } from "./server-problems";
import { VerifiedView } from "./verified-view";
import { useWrongTries } from "./use-wrong-tries";
import { codesMessageFor } from "./wording";

const FIELDS = ["email", "code"] as const;
const defaultValues: VerifyValues = { email: "", code: "" };

export function VerifyForm() {
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const codeInput = useRef<HTMLInputElement>(null);
  const problems = useServerProblems(FIELDS);
  const [verified, setVerified] = useState(false);
  const wrongTries = useWrongTries();
  const [notice, setNotice] = useState<string | null>(null);

  const verify = useMutation({
    ...verifyEmailMutation(),
    onMutate: () => {
      setNotice(null);
      problems.clearAll();
    },
    onSuccess: () => {
      verificationEmail.forget();
      setVerified(true);
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
    ...resendVerificationMutation(),
    onMutate: () => {
      setNotice(null);
      problems.clearAll();
    },
    onSuccess: (_, { body }) => {
      wrongTries.reset();
      form.resetField("code");
      setNotice(`A new code is on its way to ${body.email}. The old one no longer works.`);
    },
    onError: (error) => problems.show(toProblem(error), codesMessageFor),
  });

  const busy = verify.isPending || resend.isPending;

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => verify.mutateAsync({ body: verifySchema.parse(value) }).catch(() => undefined),
  });

  // Coming from sign-up, the address is already known and only the code is missing.
  useEffect(() => {
    const email = verificationEmail.read();
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

  if (verified) return <VerifiedView />;

  return (
    <AuthCard
      heading="Check your email"
      intro="Enter the 6-digit code we emailed you. It stays valid for a few minutes."
      footer={
        <>
          Wrong address? <Link href="/sign-up" className="underline underline-offset-4">Start again</Link>
        </>
      }
    >
      <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="flex flex-col gap-5">
        <form.Field name="email" validators={{ onDynamic: emailSchema }}>
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
        <form.Field name="code" validators={{ onDynamic: codeSchema }}>
          {(field) => (
            <Field
              ref={codeInput}
              label="Verification code"
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
        {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
        {notice && <Notice tone="info">{notice}</Notice>}
        <div className="flex items-center justify-between gap-4">
          <Button type="submit" busy={busy}>
            {verify.isPending ? "Checking…" : "Verify"}
          </Button>
          <Button variant="quiet" onClick={sendNewCode} busy={busy}>
            {resend.isPending ? "Sending…" : "Send a new code"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
