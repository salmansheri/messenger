import { useState } from "react";
import { ApiProblem } from "@/lib/api";
import { messageFor } from "./wording";

/** The first readable message from a field's validation errors (schema issues or plain strings). */
export function firstMessage(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string" && error) return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
  }
  return undefined;
}

/** What to show under a field: its validation message once it has been touched, else what the backend said. */
export function shownError(meta: { isTouched: boolean; errors: readonly unknown[] }, fromServer?: string) {
  return (meta.isTouched ? firstMessage(meta.errors) : undefined) ?? fromServer;
}

/**
 * What the backend said about a submitted form: a message for specific fields (its validation `errors` map) and one
 * for the form as a whole. A field's server message goes away as soon as the person edits that field.
 */
export function useServerProblems<Field extends string>(fields: readonly Field[]) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  return {
    fieldErrors,
    formError,
    /** Shows a problem: field messages where the backend named a field, otherwise (or besides) one for the form. */
    show(problem: ApiProblem, describe: (problem: ApiProblem) => string = messageFor) {
      const named: Partial<Record<Field, string>> = {};
      for (const field of fields) {
        if (problem.errors[field]) named[field] = problem.errors[field];
      }
      setFieldErrors(named);
      setFormError(Object.keys(named).length > 0 ? "Check the fields marked below." : describe(problem));
    },
    /** Shows a message for the form as a whole. */
    showForm(message: string) {
      setFormError(message);
    },
    showField(field: Field, message: string) {
      setFieldErrors((current) => ({ ...current, [field]: message }));
    },
    clearField(field: Field) {
      setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    },
    clearAll() {
      setFieldErrors({});
      setFormError(null);
    },
  };
}
