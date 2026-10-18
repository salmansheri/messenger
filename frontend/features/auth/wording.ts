import { ApiProblem, NETWORK_FAILURE } from "@/lib/api";

/** A wait, rounded up so we never promise less than the server asks for. */
export function describeWait(seconds: number): string {
  if (seconds < 60) return "a moment";
  if (seconds < 3600) return plural(Math.ceil(seconds / 60), "minute");
  return plural(Math.ceil(seconds / 3600), "hour");
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

const whenToRetry = (problem: ApiProblem) =>
  problem.retryAfterSeconds === undefined ? "later" : `in ${describeWait(problem.retryAfterSeconds)}`;

/** Plain words for a failed request. The backend deliberately does not say why a code was refused, and nor do we. */
export function messageFor(problem: ApiProblem): string {
  if (problem.status === NETWORK_FAILURE) return "Could not reach the server. Check your connection and try again.";
  if (problem.status === 429) return `You are doing that too often. Try again ${whenToRetry(problem)}.`;
  if (problem.status === 409) return "An account with this email already exists. Try signing in instead.";
  if (problem.status === 503) return "The server is busy. Try again in a moment.";
  if (problem.status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return problem.detail ?? problem.title;
}

/** For screens that send a code by email (sign up, ask for a new code): the limit is on codes. */
export function codesMessageFor(problem: ApiProblem): string {
  if (problem.status === 429) return `Too many codes were requested. Try again ${whenToRetry(problem)}.`;
  return messageFor(problem);
}

/** For the sign-in screen: one answer for an unknown address and a wrong password, so neither can be told apart. */
export function signInMessageFor(problem: ApiProblem): string {
  if (problem.status === 401) return "That email and password do not match. Check them and try again.";
  return messageFor(problem);
}

/** For the verification code screen: a refused code is "wrong or expired", because the backend does not say which. */
export function codeMessageFor(problem: ApiProblem): string {
  if (problem.status === 400) return "That code is wrong or has expired. Check it, or ask for a new one.";
  return messageFor(problem);
}
