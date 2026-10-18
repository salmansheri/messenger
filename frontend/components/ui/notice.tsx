import type { ReactNode } from "react";

/** A message about what just happened: a problem is announced at once, good news politely. */
export function Notice({ tone, children }: { tone: "problem" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "problem" ? "alert" : "status"}
      className={`rounded-sm border-l-2 px-3 py-2 text-sm ${
        tone === "problem" ? "border-accent bg-band text-ink" : "border-rule bg-surface text-ink"
      }`}
    >
      {children}
    </p>
  );
}
