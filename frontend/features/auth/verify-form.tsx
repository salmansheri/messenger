"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ApiProblem, call, sdk } from "@/lib/api";
import { AuthCard } from "./auth-card";
import { forgetPendingEmail, pendingEmail } from "./pending-email";
import { codeSchema, emailSchema, verifySchema, type VerifyValues } from "./schemas";
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
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmitInvalid: () => {
      requestAnimationFrame(() => formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    },
    onSubmit: async ({ value }) => {
      setNotice(null);
      problems.clearAll();
      const data = verifySchema.parse(value);
      try {
        await call(sdk.verifyEmail({ body: data }));
        forgetPendingEmail();
        setVerified(true);
      } catch (error) {
        if (!(error instanceof ApiProblem)) throw error;
        if (error.status !== 400) {
          problems.show(error);
          return;
        }
        const tries = afterWrongCode(wrongTries, data.email);
        setWrongTries(tries);
        problems.showForm(
          wrongTriesExhausted(tries)
            ? `That did not work again. A code stops working after ${WRONG_CODE_LIMIT} wrong tries, so ask for a new one.`
            : codeMessageFor(error),
        );
      }
    },
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

  async function sendNewCode() {
    setNotice(null);
    problems.clearAll();
    const address = emailSchema.safeParse(form.state.values.email);
    if (!address.success) {
      problems.showField("email", address.error.issues[0].message);
      return;
    }
    setSending(true);
    try {
      await call(sdk.resendVerification({ body: { email: address.data } }));
      setWrongTries(NO_WRONG_TRIES);
      form.resetField("code");
      setNotice(`A new code is on its way to ${address.data}. The old one no longer works.`);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      problems.show(error);
    } finally {
      setSending(false);
    }
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
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex items-center justify-between gap-4">
              <Button type="submit" busy={isSubmitting || sending}>
                {isSubmitting ? "Checking…" : "Verify"}
              </Button>
              <Button variant="quiet" onClick={sendNewCode} busy={isSubmitting || sending}>
                {sending ? "Sending…" : "Send a new code"}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </AuthCard>
  );
}
