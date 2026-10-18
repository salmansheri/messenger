import { ApiProblem } from "@/lib/api";
import { messageFor, whenToRetry } from "@/lib/api/messages";

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
