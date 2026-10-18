import { toProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";

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
