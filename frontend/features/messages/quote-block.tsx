import type { QuoteView } from "./quote";

/**
 * The quote above a reply: who said it and the start of what they said, 'Message deleted' for one that was, and plain
 * 'Message not available' for one the person may not see. When the quoted Message is loaded it is a button that goes to
 * it; otherwise it is just words.
 */
export function QuoteBlock({ view, onJump }: { view: QuoteView; onJump?: () => void }) {
  const body =
    view.kind === "unavailable" ? (
      <span className="text-ink-muted italic">Message not available</span>
    ) : (
      <>
        <span className="block font-serif text-xs font-semibold">{view.sender}</span>
        {view.kind === "deleted" ? (
          <span className="text-ink-muted italic">Message deleted</span>
        ) : (
          <span className="line-clamp-2 break-words text-ink-muted [overflow-wrap:anywhere]">{view.text}</span>
        )}
      </>
    );
  const label =
    view.kind === "unavailable"
      ? "In reply to a Message that is not available"
      : view.kind === "deleted"
        ? `In reply to a Message from ${view.sender} that was deleted`
        : `In reply to ${view.sender}: ${view.text}`;
  const style = "mb-1 block w-full max-w-prose border-l-2 border-rule bg-surface px-2 py-1 text-left text-sm";
  if (!onJump) {
    return (
      <p className={style}>
        <span className="sr-only">{label}. </span>
        <span aria-hidden="true">{body}</span>
      </p>
    );
  }
  return (
    <button type="button" onClick={onJump} aria-label={`${label}. Go to it`} className={`${style} hover:bg-band`}>
      {body}
    </button>
  );
}
