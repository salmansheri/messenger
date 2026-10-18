import type { ComponentPropsWithRef } from "react";

const STYLES = {
  primary: "bg-accent text-on-accent hover:opacity-90 px-5 py-2.5 font-medium",
  quiet: "text-ink underline underline-offset-4 decoration-rule hover:decoration-ink px-1 py-1",
} as const;

type ButtonProps = ComponentPropsWithRef<"button"> & { variant?: keyof typeof STYLES };

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-sm text-base transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${STYLES[variant]} ${className}`}
      {...props}
    />
  );
}
