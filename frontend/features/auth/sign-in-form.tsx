"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { call, sdk, toProblem } from "@/lib/api";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { session } from "@/lib/auth/app-session";
import { useSession } from "@/features/session/session-provider";
import { rememberPendingEmail } from "./pending-email";
import { signInSchema, type SignInData, type SignInValues } from "./schemas";
import { shownError, useServerProblems } from "./server-problems";
import { signInMessageFor } from "./wording";

const FIELDS = ["email", "password"] as const;
const defaultValues: SignInValues = { email: "", password: "" };

/** Signing in only starts the session; the page then sends the person on (see RedirectIfSignedIn). */
export function SignInForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const state = useSession();
  const { ref: formElement, focusFirstInvalid } = useFormElement();
  const problems = useServerProblems(FIELDS);

  const signIn = useMutation({
    mutationFn: async (data: SignInData) => {
      const issued = await call(sdk.login({ body: data }));
      if (!issued.accessToken || !issued.expiresIn) throw new Error("The sign-in answer had no access token.");
      return { accessToken: issued.accessToken, expiresInSeconds: issued.expiresIn };
    },
    onMutate: () => problems.clearAll(),
    onSuccess: (tokens) => {
      queryClient.clear(); // nothing from an earlier person's session may show up for this one
      session.signedIn(tokens);
    },
    onError: (error, data) => {
      const problem = toProblem(error);
      if (problem.status === 403) {
        // The password was right but the address was never verified: carry on at the verification screen.
        rememberPendingEmail(data.email);
        router.push("/verify");
        return;
      }
      problems.showForm(signInMessageFor(problem));
    },
  });

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => signIn.mutateAsync(signInSchema.parse(value)).catch(() => undefined),
  });

  return (
    <form ref={formElement} onSubmit={submitHandler(form)} noValidate className="flex flex-col gap-5">
      {state.status === "signedOut" && state.ended && (
        <Notice tone="info">Your session ended, so you have been signed out. Sign in again to carry on.</Notice>
      )}
      <form.Field name="email" validators={{ onDynamic: signInSchema.shape.email }}>
        {(field) => (
          <Field
            label="Email address"
            type="email"
            autoComplete="email"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={shownError(field.state.meta, problems.fieldErrors.email)}
          />
        )}
      </form.Field>
      <form.Field name="password" validators={{ onDynamic: signInSchema.shape.password }}>
        {(field) => (
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            error={shownError(field.state.meta, problems.fieldErrors.password)}
          />
        )}
      </form.Field>
      {problems.formError && <Notice tone="problem">{problems.formError}</Notice>}
      <div className="flex items-center justify-between gap-4">
        <Button type="submit" busy={signIn.isPending || state.status === "signedIn"}>
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
        <Link href="/sign-up" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
          Create an account
        </Link>
      </div>
    </form>
  );
}
