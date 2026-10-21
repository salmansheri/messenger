import type { SearchPage, SearchResult } from "@/lib/api";
import { messageFor, plural, whenToRetry } from "@/lib/api/messages";
import type { ApiProblem } from "@/lib/api/problem";
import { formatClock, formatWhen } from "@/features/conversations/present";

/** The `before` for the next page of results: the last result's id, while the server says more remain. */
export function nextBefore(page: SearchPage): string | undefined {
  return page.hasMore ? page.results?.at(-1)?.messageId : undefined;
}

/**
 * The results of all loaded pages, newest first as the server sent them, each Message once (a page fetched after a
 * Message was edited to match again could repeat one).
 */
export function resultsOf(pages: readonly SearchPage[] | undefined): SearchResult[] {
  const seen = new Set<string | undefined>();
  return (pages ?? []).flatMap((page) =>
    (page.results ?? []).filter((result) => {
      if (seen.has(result.messageId)) return false;
      seen.add(result.messageId);
      return true;
    }),
  );
}

/** The line that says (and tells a screen reader) what a search found. */
export function resultCountText(count: number, hasMore: boolean): string {
  if (count === 0) return "No Messages found";
  const found = `${plural(count, "Message")} found`;
  return hasMore ? `${found} so far, and more` : found;
}

/**
 * Why a search failed: searching is limited to a number a minute, so a 429 says how long to wait (the general wording
 * would not say it was searching); in one Conversation, a 404 means the person no longer belongs to it; anything else
 * keeps the general wording (a busy server, a lost connection).
 */
export function searchFailureMessage(problem: ApiProblem, scope: "conversation" | "all" = "conversation"): string {
  if (problem.status === 429) return `You are searching too often. Try again ${whenToRetry(problem)}.`;
  if (problem.status === 404 && scope === "conversation") return "This Conversation is no longer yours to search.";
  return messageFor(problem);
}

/**
 * When a result was said: the time alone for today, otherwise the day ('Yesterday', a weekday or a date, as in the list)
 * with the time, because a search often finds something said long ago and the day alone would hide when.
 */
export function resultTime(iso: string | undefined, now: Date, timeZone?: string): string {
  const day = formatWhen(iso, now, timeZone);
  if (!day) return "";
  const clock = formatClock(iso, timeZone);
  return day === clock ? clock : `${day}, ${clock}`;
}
