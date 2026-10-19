"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { signUpMutation, toProblem } from "@/lib/api";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { verificationEmail } from "./remembered-email";
import { signUpSchema, type SignUpValues } from "./schemas";
import { shownError, useServerProblems } from "./server-problems";
import { codesMessageFor } from "./wording";

const FIELDS = ["email", "displayName", "password"] as const;
const defaultValues: SignUpValues = { email: "", displayName: "", password: "" };

export function SignUpForm() {
  const router = useRouter();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const problems = useServerProblems(FIELDS);

  const signUp = useMutation({
    ...signUpMutation(),
    onMutate: () => problems.clearAll(),
    onSuccess: (_, { body }) => {
      verificationEmail.remember(body.email);
      router.push("/verify");
    },
    onError: (error) => problems.show(toProblem(error), codesMessageFor),
  });

  const form = useForm({
    defaultValues,
    // Check on submit; from then on, on every keystroke. (Not on blur: an error line appearing or vanishing as the pointer
    // goes down on the button moves it away and the press is lost.)
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    // The same checks again, plus trimming and lower-casing the address; the mutation reports its own failures.
    onSubmit: ({ value }) => signUp.mutateAsync({ body: signUpSchema.parse(value) }).catch(() => undefined),
  });

  return (
    <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="flex flex-col gap-5">
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
        <Button type="submit" busy={signUp.isPending}>
          {signUp.isPending ? "Creating account…" : "Create account"}
        </Button>
        <Link href="/verify" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
          I already have a code
        </Link>
      </div>
    </form>
  );
}
