"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ApiProblem, call, sdk } from "@/lib/api";
import { signUpSchema, type SignUpValues } from "./schemas";
import { messageFor } from "./wording";

type Output = ReturnType<typeof signUpSchema.parse>;
const FIELDS = ["email", "displayName", "password"] as const;

export function SignUpForm() {
  const router = useRouter();
  const form = useForm<SignUpValues, unknown, Output>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", displayName: "", password: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: Output) {
    try {
      await call(sdk.signUp({ body: values }));
      router.push(`/verify?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      let shown = false;
      for (const field of FIELDS) {
        if (error.errors[field]) {
          form.setError(field, { message: error.errors[field] });
          shown = true;
        }
      }
      form.setError("root", { message: shown ? "Check the fields marked below." : messageFor(error) });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-5">
      <Field
        label="Email address"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...form.register("email")}
      />
      <Field
        label="Your name"
        autoComplete="name"
        hint="This is how other people will see you."
        error={errors.displayName?.message}
        {...form.register("displayName")}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="8 to 72 characters."
        error={errors.password?.message}
        {...form.register("password")}
      />
      {errors.root?.message && <Notice tone="problem">{errors.root.message}</Notice>}
      <div className="flex items-center justify-between gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
        <Link href="/verify" className="text-sm underline underline-offset-4 decoration-rule hover:decoration-ink">
          I already have a code
        </Link>
      </div>
    </form>
  );
}
