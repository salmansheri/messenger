import { ApiProblem, NETWORK_FAILURE } from "@/lib/api";

/** How many wrong guesses the backend allows for one code before it stops working. */
export const WRONG_CODE_LIMIT = 5;

/** A wait, rounded up so we never promise less than the server asks for. */
export function describeWait(seconds: number): string {
  if (seconds < 60) return "a moment";
  if (seconds < 3600) return plural(Math.ceil(seconds / 60), "minute");
  return plural(Math.ceil(seconds / 3600), "hour");
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** Plain words for a failed request. The backend deliberately does not say why a code was refused, and nor do we. */
export function messageFor(problem: ApiProblem, context?: "code"): string {
  if (problem.status === NETWORK_FAILURE) return "Could not reach the server. Check your connection and try again.";
  if (problem.status === 429) {
    const when = problem.retryAfterSeconds === undefined ? "later" : `in ${describeWait(problem.retryAfterSeconds)}`;
    return `Too many codes were requested. Try again ${when}.`;
  }
  if (problem.status === 409) return "An account with this email already exists. Try signing in instead.";
  if (problem.status === 503) return "The server is busy. Try again in a moment.";
  if (problem.status >= 500) return "Something went wrong on our side. Try again in a moment.";
  if (problem.status === 400 && context === "code") {
    return "That code is wrong or has expired. Check it, or ask for a new one.";
  }
  return problem.detail ?? problem.title;
}
