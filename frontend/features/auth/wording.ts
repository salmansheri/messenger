import { ApiProblem } from "@/lib/api";
import { messageFor, whenToRetry } from "@/lib/api/messages";
import { WRONG_CODE_LIMIT, wrongTriesExhausted, type WrongTries } from "./wrong-tries";

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

/**
 * What to tell someone whose code was refused. The backend does not say why, so it is "wrong or expired"; but once as
 * many wrong tries as the backend allows have been made, the code is dead whatever is typed next, and we say so.
 */
export function refusedCodeMessage(tries: WrongTries, problem: ApiProblem): string {
  if (wrongTriesExhausted(tries)) {
    return `That did not work again. A code stops working after ${WRONG_CODE_LIMIT} wrong tries, so ask for a new one.`;
  }
  return codeMessageFor(problem);
}
