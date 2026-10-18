"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { call, sdk, toProblem } from "@/lib/api";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { resetEmail } from "./pending-email";
import { forgotPasswordSchema, type ForgotPasswordData, type ForgotPasswordValues } from "./schemas";
import { shownError, useServerProblems } from "./server-problems";
import { codesMessageFor } from "./wording";

const FIELDS = ["email"] as const;
const defaultValues: ForgotPasswordValues = { email: "" };

/**
 * Asks for a reset code. The answer is the same for every address, so the next screen says only that a code was sent
 * if the address belongs to an account, and this one never finds out which it is.
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const problems = useServerProblems(FIELDS);

  const ask = useMutation({
    mutationFn: (data: ForgotPasswordData) => call(sdk.forgotPassword({ body: data })),
    onMutate: () => problems.clearAll(),
    onSuccess: (_, data) => {
      resetEmail.remember(data.email);
      router.push("/reset-password");
    },
    onError: (error) => problems.show(toProblem(error), codesMessageFor),
  });

  const form = useForm({
    defaultValues,
    // Check on submit; from then on, on every keystroke. (Not on blur: an error line appearing or vanishing as the pointer
    // goes down on the button moves it away and the press is lost.)
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => ask.mutateAsync(forgotPasswordSchema.parse(value)).catch(() => undefined),
  });

  return (
    <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="flex flex-col gap-5">
      <form.Field name="email" validators={{ onDynamic: forgotPasswordSchema.shape.email }}>
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
      {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
      <div className="flex items-center justify-between gap-4">
        <Button type="submit" busy={ask.isPending}>
          {ask.isPending ? "Sending…" : "Send me a code"}
        </Button>
        <Link href="/reset-password" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
          I already have a code
        </Link>
      </div>
    </form>
  );
}
