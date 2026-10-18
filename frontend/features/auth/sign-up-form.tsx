"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type FormEvent } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ApiProblem, call, sdk } from "@/lib/api";
import { rememberPendingEmail } from "./pending-email";
import { signUpSchema, type SignUpValues } from "./schemas";
import { shownError, useServerProblems } from "./server-problems";

const FIELDS = ["email", "displayName", "password"] as const;
const defaultValues: SignUpValues = { email: "", displayName: "", password: "" };

export function SignUpForm() {
  const router = useRouter();
  const formElement = useRef<HTMLFormElement>(null);
  const problems = useServerProblems(FIELDS);
  const form = useForm({
    defaultValues,
    // Check a field when it loses focus; once a submit was attempted, check on every keystroke.
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmitInvalid: () => {
      // Take a keyboard or screen-reader user to the first field that needs attention.
      requestAnimationFrame(() => formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    },
    onSubmit: async ({ value }) => {
      problems.clearAll();
      const data = signUpSchema.parse(value); // the same checks, plus trimming and lower-casing the address
      try {
        await call(sdk.signUp({ body: data }));
        rememberPendingEmail(data.email);
        router.push("/verify");
      } catch (error) {
        if (!(error instanceof ApiProblem)) throw error;
        problems.show(error);
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <form ref={formElement} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <form.Field name="email" validators={{ onDynamic: signUpSchema.shape.email }}>
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
      <form.Field name="displayName" validators={{ onDynamic: signUpSchema.shape.displayName }}>
        {(field) => (
          <Field
            label="Your name"
            autoComplete="name"
            hint="This is how other people will see you."
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => {
              field.handleChange(event.target.value);
              problems.clearField("displayName");
            }}
            error={shownError(field.state.meta, problems.fieldErrors.displayName)}
          />
        )}
      </form.Field>
      <form.Field name="password" validators={{ onDynamic: signUpSchema.shape.password }}>
        {(field) => (
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="8 to 72 characters."
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => {
              field.handleChange(event.target.value);
              problems.clearField("password");
            }}
            error={shownError(field.state.meta, problems.fieldErrors.password)}
          />
        )}
      </form.Field>
      {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
      <div className="flex items-center justify-between gap-4">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" busy={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          )}
        </form.Subscribe>
        <Link href="/verify" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
          I already have a code
        </Link>
      </div>
    </form>
  );
}
