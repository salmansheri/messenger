"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ApiProblem, call, sdk } from "@/lib/api";
import { AuthCard } from "./auth-card";
import { emailSchema, verifySchema, type VerifyValues } from "./schemas";
import { messageFor, WRONG_CODE_LIMIT } from "./wording";

type Output = ReturnType<typeof verifySchema.parse>;

export function VerifyForm() {
  const email = useSearchParams().get("email") ?? "";
  const form = useForm<VerifyValues, unknown, Output>({
    resolver: zodResolver(verifySchema),
    defaultValues: { email, code: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;
  const [verified, setVerified] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (verified) successHeading.current?.focus();
  }, [verified]);

  async function submit(values: Output) {
    setNotice(null);
    try {
      await call(sdk.verifyEmail({ body: values }));
      setVerified(true);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      if (error.status === 400 && wrongTries + 1 >= WRONG_CODE_LIMIT) {
        setWrongTries(wrongTries + 1);
        form.setError("root", { message: "Too many wrong tries. This code no longer works: ask for a new one." });
        return;
      }
      if (error.status === 400) setWrongTries(wrongTries + 1);
      form.setError("root", { message: messageFor(error, "code") });
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
      setWrongTries(0);
      form.resetField("code");
      setNotice(`A new code is on its way to ${address.data}. The old one no longer works.`);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      form.setError("root", { message: messageFor(error) });
    } finally {
      setSending(false);
    }
  }

  if (verified) {
    return (
      <AuthCard
        headingRef={successHeading}
        heading="Your address is verified"
        intro="Your account is ready. Sign in to start your first Conversation."
      >
        <Link
          href="/sign-in"
          className="inline-block rounded-sm bg-accent px-5 py-2.5 font-medium text-on-accent hover:opacity-90"
        >
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading="Check your email"
      intro={
        email
          ? `We sent a 6-digit code to ${email}. It stays valid for a few minutes.`
          : "Enter the address you signed up with and the 6-digit code we emailed you."
      }
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
          autoFocus={Boolean(email)}
          className="font-mono tracking-[0.3em]"
          error={errors.code?.message}
          {...form.register("code")}
        />
        {errors.root?.message && <Notice tone="problem">{errors.root.message}</Notice>}
        {notice && <Notice tone="info">{notice}</Notice>}
        <div className="flex items-center justify-between gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Checking…" : "Verify"}
          </Button>
          <Button variant="quiet" onClick={sendNewCode} disabled={sending}>
            {sending ? "Sending…" : "Send a new code"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
