import type { ApiProblem } from "@/lib/api/problem";
import { describeWait, messageFor } from "@/lib/api/messages";

/**
 * Why a new name was not saved. The server limits changes to a few an hour, and "too often, try again in a moment"
 * would not tell someone who just made several how long to wait; every other failure keeps the general wording (a
 * refused name is shown under the field in the server's own words).
 */
export function nameChangeFailureMessage(problem: ApiProblem): string {
  if (problem.status === 429) {
    return problem.retryAfterSeconds === undefined
      ? "You have changed your name too often. Try again later."
      : `You have changed your name too often. Try again in ${describeWait(problem.retryAfterSeconds)}.`;
  }
  return messageFor(problem);
}

/**
 * Why a new Avatar was not saved, or the old one not removed. Like the name, changes are limited per hour, so a 429
 * says how long to wait; a picture the server refused (it decodes the file to decide) is described in its own words.
 */
export function avatarFailureMessage(problem: ApiProblem): string {
  if (problem.status === 429) {
    return problem.retryAfterSeconds === undefined
      ? "You have changed your Avatar too often. Try again later."
      : `You have changed your Avatar too often. Try again in ${describeWait(problem.retryAfterSeconds)}.`;
  }
  if (problem.status === 413) return "That image is larger than 10 MB.";
  if (problem.status === 400) return problem.detail || "That picture could not be used. Choose a PNG, JPEG, WebP or GIF image.";
  return messageFor(problem);
}
