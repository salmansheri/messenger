/** The first stop for a keyboard user: a way past the header to the page itself (`<main id="main">`). */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-paper focus:px-3 focus:py-2 focus:text-sm focus:underline"
    >
      Skip to content
    </a>
  );
}
