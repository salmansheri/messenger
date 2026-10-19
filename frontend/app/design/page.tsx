import { AppShell } from "@/components/app-shell";

/** A first look at the design: the index column, then the reading column with message lines. Sample copy only. */
const INDEX = [
  { name: "Ada Lovelace", line: "The engine is ready for the notes.", time: "14:02", unread: 2 },
  { name: "Analytical Engine", line: "Grace: compiled it twice, same result", time: "13:40", unread: 0 },
  { name: "Linus Torvalds", line: "Sent the patch.", time: "Mon", unread: 0 },
];

const LINES = [
  { who: "Ada Lovelace", own: false, time: "14:01", text: "Have you looked at the notes on the engine yet?" },
  { who: "Ada Lovelace", own: false, time: "14:02", text: "The engine is ready for the notes." },
  { who: "You", own: true, time: "14:03", text: "Reading them now. Section G is the one to watch." },
];

export const metadata = { title: "Design sample", robots: { index: false } };

export default function DesignSample() {
  return (
    <AppShell>
      <div className="grid flex-1 md:grid-cols-[19rem_1fr]">
        <nav aria-label="Conversations" className="border-b border-rule md:border-r md:border-b-0">
          <h2 className="px-4 pt-5 pb-2 font-serif text-sm tracking-wide text-ink-muted uppercase sm:px-6">
            Conversations
          </h2>
          <ul>
            {INDEX.map((entry) => (
              <li key={entry.name} className="border-t border-rule px-4 py-3 first:border-t-0 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-base font-semibold">{entry.name}</span>
                  <span className="font-mono text-xs text-ink-muted">{entry.time}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm text-ink-muted">{entry.line}</p>
                  {entry.unread > 0 && (
                    <span className="rounded-full bg-accent px-2 text-xs font-medium text-on-accent">
                      {entry.unread}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-label="A conversation" className="flex flex-col px-4 py-6 sm:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Conversations, set in type.</h1>
          <p className="mt-2 max-w-prose text-ink-muted">
            Lines in a column, not bubbles in a pile. Names on a rail, times in the margin.
          </p>
          <ol className="mt-8 flex max-w-2xl flex-col gap-1">
            {LINES.map((line) => (
              <li
                key={line.time}
                className={`grid grid-cols-[3.5rem_1fr] gap-3 border-l-2 py-1.5 pl-3 ${
                  line.own ? "border-accent bg-band" : "border-rule"
                }`}
              >
                <time className="pt-0.5 font-mono text-xs text-ink-muted">{line.time}</time>
                <div>
                  <span className="font-serif text-sm font-semibold">{line.who}</span>
                  <p className="leading-relaxed">{line.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
