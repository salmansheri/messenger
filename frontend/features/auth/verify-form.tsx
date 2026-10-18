"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ApiProblem, call, sdk } from "@/lib/api";
import { AuthCard } from "./auth-card";
import { forgetPendingEmail, pendingEmail } from "./pending-email";
import { emailSchema, verifySchema, type VerifyData, type VerifyValues } from "./schemas";
import { VerifiedView } from "./verified-view";
import { codeMessageFor, messageFor } from "./wording";
import { afterWrongCode, NO_WRONG_TRIES, WRONG_CODE_LIMIT, wrongTriesExhausted } from "./wrong-tries";

export function VerifyForm() {
  const form = useForm<VerifyValues, unknown, VerifyData>({
    resolver: zodResolver(verifySchema),
    defaultValues: { email: "", code: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;
  const [verified, setVerified] = useState(false);
  const [wrongTries, setWrongTries] = useState(NO_WRONG_TRIES);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = isSubmitting || sending;

  // Coming from sign-up, the address is already known and only the code is missing.
  useEffect(() => {
    const email = pendingEmail();
    if (email) {
      form.setValue("email", email);
      form.setFocus("code");
    }
  }, [form]);

  async function submit(values: VerifyData) {
    setNotice(null);
    try {
      await call(sdk.verifyEmail({ body: values }));
      forgetPendingEmail();
      setVerified(true);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      if (error.status !== 400) {
        form.setError("root", { message: messageFor(error) });
        return;
      }
      const tries = afterWrongCode(wrongTries, values.email);
      setWrongTries(tries);
      form.setError("root", {
        message: wrongTriesExhausted(tries)
          ? `That did not work again. A code stops working after ${WRONG_CODE_LIMIT} wrong tries, so ask for a new one.`
          : codeMessageFor(error),
      });
    }
  }

  async function sendNewCode() {
    setNotice(null);
    form.clearErrors("root");
    const address = emailSchema.safeParse(form.getValues("email"));
    if (!address.success) {
      form.setError("email", { message: address.error.issues[0].message });
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
      form.setError("root", { message: messageFor(error) });
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
      <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-5">
        <Field
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register("email")}
        />
        <Field
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="font-mono tracking-[0.3em]"
          error={errors.code?.message}
          {...form.register("code")}
        />
        {errors.root?.message && <Notice tone="problem">{errors.root.message}</Notice>}
        {notice && <Notice tone="info">{notice}</Notice>}
        <div className="flex items-center justify-between gap-4">
          <Button type="submit" busy={busy}>
            {isSubmitting ? "Checking…" : "Verify"}
          </Button>
          <Button variant="quiet" onClick={sendNewCode} busy={busy}>
            {sending ? "Sending…" : "Send a new code"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
