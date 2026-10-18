import { ApiProblem, NETWORK_FAILURE } from "./problem";

/** A wait, rounded up so we never promise less than the server asks for. */
export function describeWait(seconds: number): string {
  if (seconds < 60) return "a moment";
  if (seconds < 3600) return plural(Math.ceil(seconds / 60), "minute");
  return plural(Math.ceil(seconds / 3600), "hour");
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** "in 5 minutes", or "later" when the server did not say how long. */
export const whenToRetry = (problem: ApiProblem) =>
  problem.retryAfterSeconds === undefined ? "later" : `in ${describeWait(problem.retryAfterSeconds)}`;

/** Plain words for a failed request, for any screen. */
export function messageFor(problem: ApiProblem): string {
  if (problem.status === NETWORK_FAILURE) return "Could not reach the server. Check your connection and try again.";
  if (problem.status === 429) return `You are doing that too often. Try again ${whenToRetry(problem)}.`;
  if (problem.status === 409) return "An account with this email already exists. Try signing in instead.";
  if (problem.status === 503) return "The server is busy. Try again in a moment.";
  if (problem.status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return problem.detail ?? problem.title;
}
