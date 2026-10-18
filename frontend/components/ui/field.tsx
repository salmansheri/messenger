"use client";

import { useId, type ComponentPropsWithRef } from "react";

type FieldProps = Omit<ComponentPropsWithRef<"input">, "id"> & {
  label: string;
  /** The problem with the current value, shown under the field. */
  error?: string;
  /** Extra guidance shown under the field while there is no error. */
  hint?: string;
};

/** A labelled input whose error and hint are announced with it. */
export function Field({ label, error, hint, className = "", ...input }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`rounded-sm border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted ${
          error ? "border-accent" : "border-rule"
        } ${className}`}
        {...input}
      />
      {message && (
        <p id={messageId} className={`text-sm ${error ? "text-accent" : "text-ink-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
