import { toProblem } from "@/lib/api";
import { messageFor } from "@/features/auth/wording";

/** The address typed is the signed-in person's own: noticed here, before asking the server to start anything. */
export class SelfConversationError extends Error {
  constructor() {
    super("That address is your own.");
  }
}

const YOURSELF = "You cannot start a Conversation with yourself.";
const NOBODY = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";

/** Plain words for why a Direct conversation could not be started. */
export function startDirectMessageFor(error: unknown): string {
  if (error instanceof SelfConversationError) return YOURSELF;
  const problem = toProblem(error);
  if (problem.status === 400) return YOURSELF;
  if (problem.status === 404) return NOBODY;
  return messageFor(problem);
}

/** Whether the problem is about the address that was typed (so it belongs under that field, not on the whole form). */
export function blamesTheAddress(error: unknown): boolean {
  return error instanceof SelfConversationError || [400, 404].includes(toProblem(error).status);
}
