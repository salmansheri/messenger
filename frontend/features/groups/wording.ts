import type { ApiProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";
import { MAX_PARTICIPANTS } from "./members";

export type GroupAction = "create" | "rename" | "add" | "remove" | "promote" | "leave";

/** What to tell the person, and where: under the name or the address when that is the trouble, else in the panel or form. */
export type GroupFailure = { message: string; about: "name" | "address" | "panel" | "form" };

const NOBODY = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";

/**
 * Why a Group action was refused, in plain words. What a 404 means depends on what was asked: for adding or creating it
 * is the address (unknown or never verified, the backend does not say which), for removing or promoting it is the
 * Participant (already gone), for anything else it is the Group itself. Only a 409 has to be told apart by the
 * backend's own words (a full Group or a person who is already in), because it gives no other sign.
 */
export function groupFailure(problem: ApiProblem, action: GroupAction): GroupFailure {
  if (problem.errors.name) return { message: problem.errors.name, about: "name" };
  if (problem.status === 403) return { message: "Only an Admin can change this Group.", about: "panel" };
  if (problem.status === 409) {
    const full = /full/i.test(problem.detail ?? "");
    return {
      message: full
        ? `This Group is full: it has the most Participants it can have (${MAX_PARTICIPANTS}).`
        : "That person is already in this Group.",
      about: "address",
    };
  }
  if (problem.status === 404) {
    if (action === "add" || action === "create") return { message: NOBODY, about: "address" };
    if (action === "remove" || action === "promote") {
      return { message: "That person is no longer in this Group.", about: "panel" };
    }
    return { message: "This Group was not found.", about: "panel" };
  }
  return { message: messageFor(problem), about: action === "create" ? "form" : action === "add" ? "address" : "panel" };
}
