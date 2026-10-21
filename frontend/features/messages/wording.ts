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
 * someone who is waiting to press Retry how long to wait, so a short wait is counted in seconds; a refused reply says why
 * in the server's words; every other failure keeps the general wording.
 */
export function sendFailureMessage(problem: ApiProblem, wasReply = false, hadImage = false): string {
  if (problem.status === 429) return `You are sending Messages too often. Try again in ${waitWords(problem)}.`;
  // With an image a 404 usually means the server no longer has the upload; trying again uploads it afresh.
  if (problem.status === 404 && hadImage && !wasReply) return "This image could not be sent. Try again.";
  // A reply can be refused in the server's own words (the Message was deleted), or the Message it answers is gone; for
  // a plain send a 404 means the Conversation itself is no longer the person's.
  if (problem.status === 409) return problem.detail ?? "That can no longer be done.";
  if (problem.status === 404) {
    return wasReply ? "The Message you were replying to is no longer there." : "This Conversation is no longer yours.";
  }
  return messageFor(problem);
}

/**
 * Why an image could not be uploaded: the server says in its own words what is wrong with a file it refuses (not an
 * image it can use, too many pixels, empty), a file over the size limit and too many uploads have their own wording,
 * and every other failure keeps the general one.
 */
export function uploadFailureMessage(problem: ApiProblem): string {
  if (problem.status === 413) return "That image is larger than 10 MB.";
  if (problem.status === 429) return `You are sending images too often. Try again in ${waitWords(problem)}.`;
  if (problem.status === 400) return problem.detail ?? "That image cannot be sent.";
  return messageFor(problem);
}

/**
 * The name of a picture for assistive technology: who sent it and when, then its caption if it has one (the
 * caption is also shown as text beside it, so it is read here only as part of what the picture is).
 */
export function imageLabel(sender: string, time: string, caption?: string): string {
  const base = `Image from ${sender} at ${time}`;
  const text = caption?.replace(/\s+/g, " ").trim();
  return text ? `${base}: ${text}` : base;
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
