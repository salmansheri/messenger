import type { ApiProblem } from "@/lib/api/problem";
import { describeWait, messageFor, plural } from "@/lib/api/messages";

/** How long to wait, for a throttled request: whole seconds while it is under a minute, then the general wording. */
function waitWords(problem: ApiProblem): string {
  const seconds = problem.retryAfterSeconds;
  if (seconds === undefined) return "a few seconds";
  if (seconds >= 60) return describeWait(seconds);
  return plural(Math.max(1, Math.ceil(seconds)), "second");
}

/**
 * Why a Message was not sent. Sending is throttled for at most a minute at a time, and "a moment" would not tell
 * someone who is waiting to press Retry how long to wait, so a short wait is counted in seconds; every other failure
 * keeps the general wording.
 */
export function sendFailureMessage(problem: ApiProblem): string {
  if (problem.status !== 429) return messageFor(problem);
  return `You are sending Messages too often. Try again in ${waitWords(problem)}.`;
}

/**
 * Why a Message could not be edited or deleted. A 409 is the server saying the time has passed (or the Message is
 * already deleted) in its own words, which are shown as they are; the general 409 wording is about accounts.
 */
export function changeFailureMessage(problem: ApiProblem): string {
  if (problem.status === 409) return problem.detail ?? "That can no longer be done.";
  if (problem.status === 403) return "Only the sender can do that.";
  if (problem.status === 404) return "That Message is no longer there.";
  if (problem.status === 429) return `You are changing Messages too often. Try again in ${waitWords(problem)}.`;
  return messageFor(problem);
}
