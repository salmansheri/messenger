import { toProblem, type ApiProblem } from "@/lib/api";
import { describeWait, messageFor } from "@/lib/api/messages";

/** The address typed is the signed-in person's own: noticed here, before asking the server to start anything. */
export class SelfConversationError extends Error {
  constructor() {
    super("That address is your own.");
  }
}

/** What to tell the person, and where: under the address when it is the address that is the trouble. */
export type StartDirectOutcome = { message: string; about: "address" | "form" };

const YOURSELF = "You cannot start a Conversation with yourself.";
const NOBODY = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";

/** Why a Direct conversation could not be started. */
export function startDirectOutcome(error: unknown): StartDirectOutcome {
  if (error instanceof SelfConversationError) return { message: YOURSELF, about: "address" };
  const problem = toProblem(error);
  if (problem.status === 400) return { message: YOURSELF, about: "address" };
  if (problem.status === 404) return { message: NOBODY, about: "address" };
  return { message: messageFor(problem), about: "form" };
}

/**
 * Why a mute, archive or pin was refused. A 409 is the server's own plain words ("You can pin at most 3
 * Conversations.", "Unarchive it before pinning."), shown as they are: the general 409 wording is about accounts.
 */
export function settingsFailureMessage(problem: ApiProblem): string {
  if (problem.status === 409) return problem.detail ?? "That can no longer be done.";
  if (problem.status === 404) return "This Conversation is no longer yours.";
  return messageFor(problem);
}

/**
 * Why a Block or Unblock was refused: changing Blocks too often (with how long to wait), the server's own words for a
 * refusal, or a person this Conversation no longer has (the server answers that like any unknown User).
 */
export function blockFailureMessage(problem: ApiProblem): string {
  if (problem.status === 429) {
    return problem.retryAfterSeconds === undefined
      ? "You have blocked or unblocked too often. Try again later."
      : `You have blocked or unblocked too often. Try again in ${describeWait(problem.retryAfterSeconds)}.`;
  }
  if (problem.status === 409) return problem.detail ?? "That can no longer be done.";
  if (problem.status === 404) return "You no longer share this Conversation with that person.";
  return messageFor(problem);
}

/** What takes the composer's place while the person has blocked the other one in a Direct conversation. */
export function blockedNotice(name: string | undefined): string {
  return `You blocked ${name ?? "this person"}. Unblock to send a Message.`;
}

/** What blocking does, said before it happens (ADR 0006). */
export const BLOCK_EXPLANATION = [
  "They will not be told.",
  "Their Messages will not reach you, even after you unblock them.",
  "You will not see each other's presence.",
] as const;
