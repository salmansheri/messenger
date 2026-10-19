const PRINCIPLES = [
  {
    title: "Find people by their exact email.",
    text: "There is no directory to browse and nothing to search. You reach someone by the address they signed up with, and only once they have verified it.",
  },
  {
    title: "Your sign-in stays out of reach.",
    text: "The token that proves who you are lives in the page's memory, never in browser storage. A cookie the page cannot read keeps you signed in between visits.",
  },
  {
    title: "Made for every way of using it.",
    text: "Light, dark, or whatever your system prefers. Everything works from the keyboard, new Messages are announced politely, and motion stops when you ask it to.",
  },
];

/** What the app is careful about, said plainly. Three columns divided by hairlines; nothing here moves. */
export function Principles() {
  return (
    <section id="principles" aria-labelledby="principles-heading" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6 sm:pb-28">
      <h2 id="principles-heading" className="max-w-2xl font-serif text-4xl leading-[1.08] font-light tracking-[-0.025em] sm:text-5xl">
        Quiet by design.
      </h2>
      <div className="mt-12 grid border-t border-rule md:grid-cols-3">
        {PRINCIPLES.map((principle) => (
          <div key={principle.title} className="border-b border-rule py-8 md:border-r md:border-b-0 md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
            <h3 className="font-serif text-xl font-semibold tracking-tight">{principle.title}</h3>
            <p className="mt-3 max-w-sm leading-relaxed text-ink-muted">{principle.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
