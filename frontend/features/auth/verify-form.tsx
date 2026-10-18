"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { call, sdk, toProblem } from "@/lib/api";
import { AuthCard } from "./auth-card";
import { forgetPendingEmail, pendingEmail } from "./pending-email";
import { codeSchema, emailSchema, verifySchema, type VerifyData, type VerifyValues } from "./schemas";
import { shownError, useServerProblems } from "./server-problems";
import { VerifiedView } from "./verified-view";
import { codeMessageFor } from "./wording";
import { afterWrongCode, NO_WRONG_TRIES, WRONG_CODE_LIMIT, wrongTriesExhausted } from "./wrong-tries";

const FIELDS = ["email", "code"] as const;
const defaultValues: VerifyValues = { email: "", code: "" };

export function VerifyForm() {
  const formElement = useRef<HTMLFormElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const problems = useServerProblems(FIELDS);
  const [verified, setVerified] = useState(false);
  const [wrongTries, setWrongTries] = useState(NO_WRONG_TRIES);
  const [notice, setNotice] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: (data: VerifyData) => call(sdk.verifyEmail({ body: data })),
    onMutate: () => {
      setNotice(null);
      problems.clearAll();
    },
    onSuccess: () => {
      forgetPendingEmail();
      setVerified(true);
    },
    onError: (error, data) => {
      const problem = toProblem(error);
      if (problem.status !== 400) {
        problems.show(problem);
        return;
      }
      const tries = afterWrongCode(wrongTries, data.email);
      setWrongTries(tries);
      problems.showForm(
        wrongTriesExhausted(tries)
          ? `That did not work again. A code stops working after ${WRONG_CODE_LIMIT} wrong tries, so ask for a new one.`
          : codeMessageFor(problem),
      );
    },
  });

  const resend = useMutation({
    mutationFn: (email: string) => call(sdk.resendVerification({ body: { email } })),
    onMutate: () => {
      setNotice(null);
      problems.clearAll();
    },
    onSuccess: (_, email) => {
      setWrongTries(NO_WRONG_TRIES);
      form.resetField("code");
      setNotice(`A new code is on its way to ${email}. The old one no longer works.`);
    },
    onError: (error) => problems.show(toProblem(error)),
  });

  const busy = verify.isPending || resend.isPending;

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmitInvalid: () => {
      requestAnimationFrame(() => formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    },
    onSubmit: ({ value }) => verify.mutateAsync(verifySchema.parse(value)).catch(() => undefined),
  });

  // Coming from sign-up, the address is already known and only the code is missing.
  useEffect(() => {
    const email = pendingEmail();
    if (email) {
      form.setFieldValue("email", email);
      codeInput.current?.focus();
    }
  }, [form]);

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  }

  function sendNewCode() {
    const address = emailSchema.safeParse(form.state.values.email);
    if (!address.success) {
      setNotice(null);
      problems.clearAll();
      problems.showField("email", address.error.issues[0].message);
      return;
    }
    resend.mutate(address.data);
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
      <form ref={formElement} onSubmit={submit} noValidate className="flex flex-col gap-5">
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
