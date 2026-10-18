import type { ComponentPropsWithRef, MouseEvent } from "react";

const STYLES = {
  primary: "bg-accent text-on-accent hover:opacity-90 px-5 py-2.5 font-medium",
  quiet: "text-ink underline underline-offset-4 decoration-rule hover:decoration-ink px-1 py-1",
} as const;

type Variant = keyof typeof STYLES;

/** The look of a button, for things that must be a link but should look like one (the same classes, one place). */
export function buttonStyles(variant: Variant = "primary") {
  return `inline-block rounded-sm text-base transition-opacity aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${STYLES[variant]}`;
}

type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: Variant;
  /**
   * Something is already in progress: the button looks disabled and does nothing when pressed, but stays focusable,
   * so a keyboard user is not thrown out of the form the moment they press it.
   */
  busy?: boolean;
};

export function Button({ variant = "primary", className = "", type = "button", busy, onClick, ...props }: ButtonProps) {
  function click(event: MouseEvent<HTMLButtonElement>) {
    if (busy) {
      event.preventDefault(); // also stops a submit button from submitting again
      return;
    }
    onClick?.(event);
  }
  return <button type={type} aria-disabled={busy || undefined} onClick={click} className={`${buttonStyles(variant)} ${className}`} {...props} />;
}
