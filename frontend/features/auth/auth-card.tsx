import type { ReactNode, Ref } from "react";

/** The frame of a signed-out screen: a serif heading, a line of explanation, the form, and a footer line. */
export function AuthCard({
  heading,
  intro,
  children,
  footer,
  headingRef,
}: {
  heading: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <h1 ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold tracking-tight outline-none">
        {heading}
      </h1>
      {intro && <p className="mt-2 text-ink-muted">{intro}</p>}
      <div className="mt-8">{children}</div>
      {footer && <p className="mt-8 border-t border-rule pt-4 text-sm text-ink-muted">{footer}</p>}
    </div>
  );
}
