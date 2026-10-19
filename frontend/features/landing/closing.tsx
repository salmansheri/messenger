import { AccountLinks } from "./account-links";

/** The last word: one line, one way in, and a glow under it. */
export function Closing() {
  return (
    <section aria-labelledby="closing-heading" className="relative isolate overflow-hidden border-t border-rule px-5 py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-80"
        style={{
          background:
            "radial-gradient(ellipse 50% 100% at 50% 100%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 75%)",
        }}
      />
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 id="closing-heading" className="font-serif text-5xl leading-[1.05] font-light tracking-[-0.03em] sm:text-6xl">
          Start a Conversation.
        </h2>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-muted">
          Create an account with your email address, confirm it with a six-digit code, and you are in.
        </p>
        <div className="mt-9">
          <AccountLinks size="large" />
        </div>
      </div>
    </section>
  );
}
