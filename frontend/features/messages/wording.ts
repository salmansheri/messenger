import type { ApiProblem } from "@/lib/api/problem";
import { describeWait, messageFor, plural } from "@/lib/api/messages";

/**
 * Why a Message was not sent. Sending is throttled for at most a minute at a time, and "a moment" would not tell
 * someone who is waiting to press Retry how long to wait, so a short wait is counted in seconds; every other failure
 * keeps the general wording.
 */
export function sendFailureMessage(problem: ApiProblem): string {
  if (problem.status !== 429) return messageFor(problem);
  const lead = "You are sending Messages too often.";
  const seconds = problem.retryAfterSeconds;
  if (seconds === undefined) return `${lead} Try again in a few seconds.`;
  if (seconds >= 60) return `${lead} Try again in ${describeWait(seconds)}.`;
  return `${lead} Try again in ${plural(Math.max(1, Math.ceil(seconds)), "second")}.`;
}
