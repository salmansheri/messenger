"use client";

import { useId, useState, type ComponentPropsWithRef } from "react";

type FieldProps = Omit<ComponentPropsWithRef<"input">, "id"> & {
  label: string;
  /** The problem with the current value, shown under the field. */
  error?: string;
  /** Extra guidance shown under the field while there is no error. */
  hint?: string;
};

/** A labelled input whose error and hint are announced with it. A password field has a button to show it and hide it again. */
export function Field({ label, error, hint, className = "", type, ...input }: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const reveals = type === "password";
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={reveals && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={`w-full rounded-sm border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted ${
            error ? "border-accent" : "border-rule"
          } ${reveals ? "pr-16" : ""} ${className}`}
          {...input}
        />
        {reveals && (
          // Its name is its words ("Show password"), so what a person sees and what they say to a voice control match.
          <button
            type="button"
            aria-controls={id}
            onClick={() => setShown((current) => !current)}
            className="absolute inset-y-0 right-0 rounded-sm px-3 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            <span aria-hidden>{shown ? "Hide" : "Show"}</span>
            <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
          </button>
        )}
      </div>
      {message && (
        <p id={messageId} className={`text-sm ${error ? "text-accent" : "text-ink-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
