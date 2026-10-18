"use client";

import { useRef, type FormEvent } from "react";

/** The `<form>` element of a screen and what to do about a failed submit: send focus to the first field in error. */
export function useFormElement() {
  const ref = useRef<HTMLFormElement>(null);
  const focusFirstInvalid = () => {
    // after the errors have been drawn, so the field is already marked invalid
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };
  return { ref, focusFirstInvalid };
}

/** Submit handler for a TanStack form: the browser must not also submit it itself. */
export function submitHandler(form: { handleSubmit: () => Promise<void> }) {
  return (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  };
}
